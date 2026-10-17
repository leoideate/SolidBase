import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Tx } from "../db";
import type { Actor } from "../actor";
import { AppError, Forbidden, pgCode, pgConstraint, pgMessage } from "../errors";
import { elapsedSeconds, splitAtWeekBoundaries, weekStartOf } from "@/lib/time";
import { audit } from "./audit";
import { priceEntry } from "./rates";
import { ensureTimesheet } from "./timesheets";

type Entry = typeof schema.workEntries.$inferSelect;

async function dbNow(tx: Tx): Promise<Date> {
  const [r] = await tx.execute<{ now: string }>(sql`select now() as now`);
  return new Date(r.now);
}

export async function getOpenEntry(actor: Actor) {
  const [e] = await db
    .select()
    .from(schema.workEntries)
    .where(and(eq(schema.workEntries.workerId, actor.memberId), eq(schema.workEntries.status, "open")));
  return e ?? null;
}

/** Projects and roles the worker may clock against: assigned and active (F05). */
export async function clockOptions(actor: Actor) {
  const projects = await db
    .select({ id: schema.projects.id, code: schema.projects.code, name: schema.projects.name })
    .from(schema.workerProjects)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.workerProjects.projectId))
    .where(and(eq(schema.workerProjects.workerId, actor.memberId), eq(schema.projects.isActive, true)))
    .orderBy(schema.projects.code);
  const roles = await db
    .select({ id: schema.jobRoles.id, code: schema.jobRoles.code, name: schema.jobRoles.name })
    .from(schema.workerJobRoles)
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, schema.workerJobRoles.jobRoleId))
    .where(and(eq(schema.workerJobRoles.workerId, actor.memberId), eq(schema.jobRoles.isActive, true)))
    .orderBy(schema.jobRoles.name);
  return { projects, roles };
}

export type ClockResult = { entry: Entry; replayed: boolean };

/**
 * Clock in (F05, F07, Q01). The client sends a UUID per button press. A retry with the same key
 * returns the original entry. The partial unique index guarantees at most one open entry per
 * worker even when requests arrive together. The timestamp is the database server's clock.
 */
export async function clockIn(actor: Actor, input: { projectId: string; jobRoleId: string; key: string }): Promise<ClockResult> {
  if (!actor.isWorker) throw new Forbidden("Only workers can clock in.");
  const key = input.key;
  const existing = await findByKey("in", key, actor);
  if (existing) return { entry: existing, replayed: true };

  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: schema.projects.id })
        .from(schema.workerProjects)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.workerProjects.projectId))
        .where(
          and(
            eq(schema.workerProjects.workerId, actor.memberId),
            eq(schema.projects.id, input.projectId),
            eq(schema.projects.isActive, true),
            eq(schema.projects.companyId, actor.companyId),
          ),
        );
      if (!project) throw new AppError("Choose one of your assigned, active projects.");
      const [role] = await tx
        .select({ id: schema.jobRoles.id })
        .from(schema.workerJobRoles)
        .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, schema.workerJobRoles.jobRoleId))
        .where(
          and(
            eq(schema.workerJobRoles.workerId, actor.memberId),
            eq(schema.jobRoles.id, input.jobRoleId),
            eq(schema.jobRoles.isActive, true),
          ),
        );
      if (!role) throw new AppError("Choose one of your assigned, active roles.");

      const now = await dbNow(tx);
      const ts = await ensureTimesheet(tx, actor.companyId, actor.memberId, weekStartOf(now));
      const [entry] = await tx
        .insert(schema.workEntries)
        .values({
          companyId: actor.companyId,
          workerId: actor.memberId,
          projectId: input.projectId,
          jobRoleId: input.jobRoleId,
          timesheetId: ts.id,
          startAt: now,
          status: "open",
          source: "clock",
          clockInKey: key,
        })
        .returning();
      await audit(tx, actor, "entry.clock_in", "work_entry", entry.id);
      return { entry, replayed: false };
    });
  } catch (e) {
    return handleClockConflict(e, actor, "in", key);
  }
}

/**
 * Clock out (F06). Closes the worker's open entry at server time. A shift that crosses Monday
 * 00:00 Dublin is split into linked entries, one per weekly timesheet, with no time duplicated.
 */
export async function clockOut(actor: Actor, input: { key: string }): Promise<ClockResult> {
  if (!actor.isWorker) throw new Forbidden("Only workers can clock out.");
  const existing = await findByKey("out", input.key, actor);
  if (existing) return { entry: existing, replayed: true };

  try {
    return await db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(schema.workEntries)
        .where(and(eq(schema.workEntries.workerId, actor.memberId), eq(schema.workEntries.status, "open")))
        .for("update");
      if (!open) {
        const replay = await findByKey("out", input.key, actor, tx);
        if (replay) return { entry: replay, replayed: true };
        throw new AppError("You have no open shift.", "no_open_entry");
      }
      const now = await dbNow(tx);
      if (now <= open.startAt) throw new AppError("Clock out time must be after clock in. Try again in a moment.");
      const entry = await closeEntryAt(tx, actor, open, now, { clockOutKey: input.key });
      await audit(tx, actor, "entry.clock_out", "work_entry", open.id);
      return { entry, replayed: false };
    });
  } catch (e) {
    return handleClockConflict(e, actor, "out", input.key);
  }
}

/**
 * Close an open entry at `end`, splitting at week boundaries. Returns the first (original) piece.
 * Shared by clock-out and manager reconstruction of a missing clock-out.
 */
export async function closeEntryAt(tx: Tx, actor: Actor, open: Entry, end: Date, extra: { clockOutKey?: string } = {}) {
  const pieces = splitAtWeekBoundaries(open.startAt, end);
  const splitGroupId = pieces.length > 1 ? randomUUID() : null;
  let first: Entry | null = null;
  for (const [i, piece] of pieces.entries()) {
    const durationSeconds = elapsedSeconds(piece.start, piece.end);
    const pricing = await priceEntry(tx, { ...open, startAt: piece.start, durationSeconds });
    if (i === 0) {
      const [updated] = await tx
        .update(schema.workEntries)
        .set({
          endAt: piece.end,
          durationSeconds,
          status: "closed",
          splitGroupId,
          ...pricing,
          clockOutKey: extra.clockOutKey ?? null,
          updatedAt: new Date(),
        })
        .where(eq(schema.workEntries.id, open.id))
        .returning();
      first = updated;
    } else {
      const ts = await ensureTimesheet(tx, open.companyId, open.workerId, piece.weekStart);
      if (ts.status !== "draft") throw new AppError("The following week's timesheet is already submitted; a manager must correct it.");
      const [inserted] = await tx
        .insert(schema.workEntries)
        .values({
          companyId: open.companyId,
          workerId: open.workerId,
          projectId: open.projectId,
          jobRoleId: open.jobRoleId,
          timesheetId: ts.id,
          startAt: piece.start,
          endAt: piece.end,
          durationSeconds,
          status: "closed",
          source: open.source,
          splitGroupId,
          ...pricing,
        })
        .returning();
      await tx.insert(schema.entryRevisions).values({
        companyId: open.companyId,
        entryId: inserted.id,
        action: "split",
        before: null,
        after: { splitFrom: open.id, startAt: piece.start, endAt: piece.end },
        reason: "Shift crossed the weekly boundary (Monday 00:00 Europe/Dublin)",
        editedBy: actor.memberId,
      });
    }
  }
  return first!;
}

async function findByKey(kind: "in" | "out", key: string, actor: Actor, tx: Tx | typeof db = db) {
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw new AppError("Invalid request key.");
  const col = kind === "in" ? schema.workEntries.clockInKey : schema.workEntries.clockOutKey;
  const [e] = await tx
    .select()
    .from(schema.workEntries)
    .where(and(eq(col, key), eq(schema.workEntries.workerId, actor.memberId)));
  return e ?? null;
}

async function handleClockConflict(e: unknown, actor: Actor, kind: "in" | "out", key: string): Promise<ClockResult> {
  if (e instanceof AppError) throw e;
  const code = pgCode(e);
  const constraint = pgConstraint(e);
  if (code === "23505") {
    // Same request retried concurrently: return the winner.
    const replay = await findByKey(kind, key, actor);
    if (replay) return { entry: replay, replayed: true };
    if (constraint === "work_entries_one_open_per_worker") {
      throw new AppError("You are already clocked in. Clock out first to change project or role.", "already_open");
    }
  }
  if (code === "23P01") throw new AppError("This time overlaps another entry. Ask your manager to correct it.", "overlap");
  if (pgMessage(e)?.includes("timesheet_locked")) throw new AppError("This week is approved and locked.", "locked");
  throw e;
}
