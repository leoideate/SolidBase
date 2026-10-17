import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Tx } from "../db";
import type { Actor } from "../actor";
import { assertCanManageWorker } from "../authz";
import { AppError, NotFound, pgCode, pgMessage } from "../errors";
import { elapsedSeconds, weekStartOf } from "@/lib/time";
import { audit } from "./audit";
import { priceEntry } from "./rates";
import { ensureTimesheet, lockTimesheet, versionAfterCorrection } from "./timesheets";

type Entry = typeof schema.workEntries.$inferSelect;

export type EntryInput = { projectId: string; jobRoleId: string; startAt: Date; endAt: Date | null };

const fields = (e: Entry) => ({
  projectId: e.projectId,
  jobRoleId: e.jobRoleId,
  startAt: e.startAt,
  endAt: e.endAt,
  durationSeconds: e.durationSeconds,
  appliedRate: e.appliedRate,
  value: e.value,
  status: e.status,
  timesheetId: e.timesheetId,
});

async function validateAllocation(tx: Tx, actor: Actor, projectId: string, jobRoleId: string) {
  const [p] = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.companyId, actor.companyId)));
  if (!p) throw new AppError("Unknown project.");
  const [r] = await tx
    .select({ id: schema.jobRoles.id })
    .from(schema.jobRoles)
    .where(and(eq(schema.jobRoles.id, jobRoleId), eq(schema.jobRoles.companyId, actor.companyId)));
  if (!r) throw new AppError("Unknown role.");
}

function validateTimes(startAt: Date, endAt: Date | null) {
  const now = new Date();
  if (startAt > now) throw new AppError("Start time cannot be in the future.");
  if (endAt) {
    if (endAt <= startAt) throw new AppError("End time must be after start time.");
    if (endAt > now) throw new AppError("End time cannot be in the future.");
    // Entries never span a weekly boundary; a correction that would cross one must be two entries.
    if (weekStartOf(startAt) !== weekStartOf(new Date(endAt.getTime() - 1))) {
      throw new AppError("An entry must stay within one week (Mon–Sun). Split it into two entries.");
    }
  }
}

async function targetTimesheet(tx: Tx, actor: Actor, workerId: string, startAt: Date) {
  const ts = await ensureTimesheet(tx, actor.companyId, workerId, weekStartOf(startAt));
  const locked = await lockTimesheet(tx, ts.id, actor.companyId);
  if (locked.status === "approved") throw new AppError("That week is approved. Reopen it before correcting.");
  return locked;
}

function mapDbError(e: unknown): never {
  if (e instanceof AppError) throw e;
  if (pgCode(e) === "23P01") throw new AppError("This time overlaps another entry for the worker.", "overlap");
  if (pgCode(e) === "23505") throw new AppError("The worker already has an open entry.", "already_open");
  if (pgMessage(e)?.includes("timesheet_locked")) throw new AppError("That week is approved and locked.", "locked");
  throw e;
}

/**
 * Manager/admin correction of project, role or time, or closing a missing clock-out (F13, F14).
 * Requires a reason; preserves original and revised values. Recalculates rate and value.
 */
export async function correctEntry(actor: Actor, entryId: string, input: EntryInput, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required for every correction.");
  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(schema.workEntries)
        .where(and(eq(schema.workEntries.id, entryId), eq(schema.workEntries.companyId, actor.companyId)))
        .for("update");
      if (!entry || entry.status === "void") throw new NotFound("Entry not found.");
      await assertCanManageWorker(tx, actor, entry.workerId);
      const currentTs = await lockTimesheet(tx, entry.timesheetId, actor.companyId);
      if (currentTs.status === "approved") throw new AppError("That week is approved. Reopen it before correcting.");
      if (entry.status === "closed" && !input.endAt) throw new AppError("A closed entry needs an end time.");
      await validateAllocation(tx, actor, input.projectId, input.jobRoleId);
      validateTimes(input.startAt, input.endAt);

      const target = await targetTimesheet(tx, actor, entry.workerId, input.startAt);
      const durationSeconds = input.endAt ? elapsedSeconds(input.startAt, input.endAt) : null;
      const pricing = durationSeconds != null
        ? await priceEntry(tx, { ...entry, ...input, durationSeconds })
        : { rateId: null, appliedRate: null, value: null, rateStatus: "pending" as const };
      const [updated] = await tx
        .update(schema.workEntries)
        .set({
          projectId: input.projectId,
          jobRoleId: input.jobRoleId,
          startAt: input.startAt,
          endAt: input.endAt,
          durationSeconds,
          status: input.endAt ? "closed" : "open",
          timesheetId: target.id,
          ...pricing,
          updatedAt: new Date(),
        })
        .where(eq(schema.workEntries.id, entry.id))
        .returning();
      const action = entry.status === "open" && input.endAt ? "reconstructed" : "corrected";
      await tx.insert(schema.entryRevisions).values({
        companyId: actor.companyId,
        entryId: entry.id,
        action,
        before: fields(entry),
        after: fields(updated),
        reason: reason.trim(),
        editedBy: actor.memberId,
      });
      await versionAfterCorrection(tx, actor, currentTs.id, reason.trim());
      if (target.id !== currentTs.id) await versionAfterCorrection(tx, actor, target.id, reason.trim());
      await audit(tx, actor, `entry.${action}`, "work_entry", entry.id, { reason });
      return updated;
    });
  } catch (e) {
    mapDbError(e);
  }
}

/** Manager/admin reconstructs a missing entry for an assigned worker (F14). */
export async function addEntry(actor: Actor, workerId: string, input: EntryInput & { endAt: Date }, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required.");
  try {
    return await db.transaction(async (tx) => {
      await assertCanManageWorker(tx, actor, workerId);
      await validateAllocation(tx, actor, input.projectId, input.jobRoleId);
      validateTimes(input.startAt, input.endAt);
      const ts = await targetTimesheet(tx, actor, workerId, input.startAt);
      const durationSeconds = elapsedSeconds(input.startAt, input.endAt);
      const pricing = await priceEntry(tx, { companyId: actor.companyId, workerId, ...input, durationSeconds });
      const [entry] = await tx
        .insert(schema.workEntries)
        .values({
          companyId: actor.companyId,
          workerId,
          projectId: input.projectId,
          jobRoleId: input.jobRoleId,
          timesheetId: ts.id,
          startAt: input.startAt,
          endAt: input.endAt,
          durationSeconds,
          status: "closed",
          source: "manager",
          ...pricing,
        })
        .returning();
      await tx.insert(schema.entryRevisions).values({
        companyId: actor.companyId,
        entryId: entry.id,
        action: "created",
        before: null,
        after: fields(entry),
        reason: reason.trim(),
        editedBy: actor.memberId,
      });
      await versionAfterCorrection(tx, actor, ts.id, reason.trim());
      await audit(tx, actor, "entry.created_by_manager", "work_entry", entry.id, { reason });
      return entry;
    });
  } catch (e) {
    mapDbError(e);
  }
}

/** Void a duplicate or mistaken entry. History is kept; the entry is excluded from totals. */
export async function voidEntry(actor: Actor, entryId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required.");
  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(schema.workEntries)
        .where(and(eq(schema.workEntries.id, entryId), eq(schema.workEntries.companyId, actor.companyId)))
        .for("update");
      if (!entry || entry.status === "void") throw new NotFound("Entry not found.");
      await assertCanManageWorker(tx, actor, entry.workerId);
      const ts = await lockTimesheet(tx, entry.timesheetId, actor.companyId);
      if (ts.status === "approved") throw new AppError("That week is approved. Reopen it before correcting.");
      const [updated] = await tx
        .update(schema.workEntries)
        .set({ status: "void", updatedAt: new Date() })
        .where(eq(schema.workEntries.id, entry.id))
        .returning();
      await tx.insert(schema.entryRevisions).values({
        companyId: actor.companyId,
        entryId: entry.id,
        action: "voided",
        before: fields(entry),
        after: fields(updated),
        reason: reason.trim(),
        editedBy: actor.memberId,
      });
      await versionAfterCorrection(tx, actor, ts.id, reason.trim());
      await audit(tx, actor, "entry.voided", "work_entry", entry.id, { reason });
      return updated;
    });
  } catch (e) {
    mapDbError(e);
  }
}
