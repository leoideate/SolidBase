import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { DbOrTx, Tx } from "../db";
import type { Actor } from "../actor";
import { assertCanManageWorker } from "../authz";
import { AppError, Forbidden, NotFound } from "../errors";
import { sumMoney } from "@/lib/money";
import { localDate, weekEndInstant } from "@/lib/time";
import { audit } from "./audit";
import { priceEntry } from "./rates";

type Timesheet = typeof schema.timesheets.$inferSelect;

/** Get or create the Draft timesheet for a worker's week. */
export async function ensureTimesheet(tx: DbOrTx, companyId: string, workerId: string, weekStart: string): Promise<Timesheet> {
  await tx.insert(schema.timesheets).values({ companyId, workerId, weekStart }).onConflictDoNothing();
  const [ts] = await tx
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.workerId, workerId), eq(schema.timesheets.weekStart, weekStart)));
  return ts;
}

export async function lockTimesheet(tx: Tx, timesheetId: string, companyId: string): Promise<Timesheet> {
  const [ts] = await tx
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.id, timesheetId), eq(schema.timesheets.companyId, companyId)))
    .for("update");
  if (!ts) throw new NotFound("Timesheet not found.");
  return ts;
}

export type SnapshotEntry = {
  id: string;
  projectId: string;
  jobRoleId: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number | null;
  breakMinutes?: number;
  note?: string | null;
  rateId: string | null;
  rateUnit?: string;
  appliedRate: string | null;
  value: string | null;
  rateStatus: string;
  status: string;
};
export type Snapshot = { entries: SnapshotEntry[] };

/** Frozen representation of a timesheet's non-void entries, used for versions and change detection. */
export async function buildSnapshot(tx: DbOrTx, timesheetId: string) {
  const rows = await tx
    .select()
    .from(schema.workEntries)
    .where(and(eq(schema.workEntries.timesheetId, timesheetId), sql`${schema.workEntries.status} <> 'void'`))
    .orderBy(asc(schema.workEntries.startAt), asc(schema.workEntries.id));
  const entries: SnapshotEntry[] = rows.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    jobRoleId: e.jobRoleId,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt?.toISOString() ?? null,
    durationSeconds: e.durationSeconds,
    breakMinutes: e.breakMinutes,
    note: e.note,
    rateId: e.rateId,
    rateUnit: e.rateUnit,
    appliedRate: e.appliedRate,
    value: e.value,
    rateStatus: e.rateStatus,
    status: e.status,
  }));
  const totalSeconds = entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
  const anyUnpriced = entries.some((e) => e.status === "closed" && e.value == null);
  const totalValue = anyUnpriced ? null : sumMoney(entries.map((e) => e.value));
  return { snapshot: { entries } as Snapshot, totalSeconds, totalValue };
}

async function createVersion(
  tx: Tx,
  actor: Actor,
  ts: Timesheet,
  cause: (typeof schema.VERSION_CAUSES)[number],
  reason?: string | null,
) {
  const versionNo = ts.currentVersion + 1;
  const snap = await buildSnapshot(tx, ts.id);
  await tx.insert(schema.timesheetVersions).values({
    companyId: ts.companyId,
    timesheetId: ts.id,
    versionNo,
    cause,
    causeReason: reason ?? null,
    createdBy: actor.memberId,
    ...snap,
  });
  await tx
    .update(schema.timesheets)
    .set({ currentVersion: versionNo, updatedAt: new Date() })
    .where(eq(schema.timesheets.id, ts.id));
  return versionNo;
}

/** Re-resolve rates for closed entries before freezing a version. */
async function refreshPricing(tx: Tx, timesheetId: string) {
  const rows = await tx
    .select()
    .from(schema.workEntries)
    .where(and(eq(schema.workEntries.timesheetId, timesheetId), eq(schema.workEntries.status, "closed")));
  for (const e of rows) {
    const p = await priceEntry(tx, { ...e, durationSeconds: e.durationSeconds ?? 0 });
    if (p.rateId !== e.rateId || p.value !== e.value || p.rateStatus !== e.rateStatus) {
      await tx.update(schema.workEntries).set(p).where(eq(schema.workEntries.id, e.id));
    }
  }
}

async function openEntryCount(tx: DbOrTx, timesheetId: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.workEntries)
    .where(and(eq(schema.workEntries.timesheetId, timesheetId), eq(schema.workEntries.status, "open")));
  return r.n;
}

async function addComment(
  tx: DbOrTx,
  actor: Actor,
  ts: Timesheet,
  kind: "comment" | "correction_request" | "return" | "reopen",
  body: string,
  entryId?: string | null,
) {
  await tx.insert(schema.timesheetComments).values({
    companyId: ts.companyId,
    timesheetId: ts.id,
    entryId: entryId ?? null,
    authorId: actor.memberId,
    kind,
    body,
  });
}

/**
 * Worker submits (or resubmits) their own weekly timesheet (F11, F15). The week must have ended
 * so no new clock entries can land in it, and no entry may still be open.
 */
export async function submitTimesheet(actor: Actor, timesheetId: string, comment?: string) {
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    if (ts.workerId !== actor.memberId) throw new Forbidden("You can only submit your own timesheet.");
    if (ts.status !== "draft" && ts.status !== "returned") throw new AppError("This timesheet has already been submitted.");
    if (new Date() < weekEndInstant(ts.weekStart)) throw new AppError("You can submit this week once it has ended (Monday 00:00).");
    if ((await openEntryCount(tx, ts.id)) > 0) throw new AppError("Clock out of your open shift before submitting.");
    await refreshPricing(tx, ts.id);
    const cause = ts.status === "returned" ? "resubmitted" : "submitted";
    if (comment?.trim()) await addComment(tx, actor, ts, "comment", comment.trim());
    const v = await createVersion(tx, actor, ts, cause);
    await tx.update(schema.timesheets).set({ status: "submitted" }).where(eq(schema.timesheets.id, ts.id));
    await audit(tx, actor, `timesheet.${cause}`, "timesheet", ts.id, { version: v });
    return v;
  });
}

/**
 * Admin, or the worker's own supervisor, submits on the worker's behalf with a reason: the worker
 * is unavailable or has no app login because the supervisor records their hours. Not for self.
 */
export async function submitOnBehalf(actor: Actor, timesheetId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required.");
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    if (ts.workerId === actor.memberId) throw new AppError("Submit your own timesheet from your worker view.");
    await assertCanManageWorker(tx, actor, ts.workerId);
    if (ts.status !== "draft" && ts.status !== "returned") throw new AppError("This timesheet has already been submitted.");
    if (new Date() < weekEndInstant(ts.weekStart)) throw new AppError("The week has not ended yet.");
    if ((await openEntryCount(tx, ts.id)) > 0) throw new AppError("Close or correct the open entry first.");
    await refreshPricing(tx, ts.id);
    const v = await createVersion(tx, actor, ts, "admin_submitted", reason.trim());
    await tx.update(schema.timesheets).set({ status: "submitted" }).where(eq(schema.timesheets.id, ts.id));
    await audit(tx, actor, "timesheet.submitted_on_behalf", "timesheet", ts.id, { version: v, reason });
    return v;
  });
}

/** Manager returns a submitted timesheet to the worker with comments (F15). */
export async function returnTimesheet(actor: Actor, timesheetId: string, versionNo: number, comment: string) {
  if (!comment.trim()) throw new AppError("Add a comment explaining what needs clarification.");
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    await assertCanManageWorker(tx, actor, ts.workerId);
    if (ts.status !== "submitted") throw new AppError("Only submitted timesheets can be returned.");
    if (ts.currentVersion !== versionNo) throw new AppError("The timesheet changed. Review the latest version.");
    await tx
      .update(schema.timesheetVersions)
      .set({ returnedAt: new Date(), returnedBy: actor.memberId, returnComment: comment.trim() })
      .where(and(eq(schema.timesheetVersions.timesheetId, ts.id), eq(schema.timesheetVersions.versionNo, versionNo)));
    await tx.update(schema.timesheets).set({ status: "returned", updatedAt: new Date() }).where(eq(schema.timesheets.id, ts.id));
    await addComment(tx, actor, ts, "return", comment.trim());
    await audit(tx, actor, "timesheet.returned", "timesheet", ts.id, { version: versionNo });
  });
}

export type ApprovalBlocker = { code: string; message: string };

/** Why a timesheet cannot be approved right now (F14, F16, T05). Empty array = approvable. */
export async function approvalBlockers(tx: DbOrTx, actor: Actor, ts: Timesheet): Promise<ApprovalBlocker[]> {
  const out: ApprovalBlocker[] = [];
  const [worker] = await tx.select().from(schema.companyMembers).where(eq(schema.companyMembers.id, ts.workerId));
  if (ts.workerId === actor.memberId || worker?.userId === actor.userId) {
    out.push({ code: "self", message: "You cannot approve your own hours. Another authorised reviewer must approve them." });
  }
  if (ts.status !== "submitted") out.push({ code: "status", message: `Timesheet is ${ts.status}, not submitted.` });
  const entries = await tx
    .select()
    .from(schema.workEntries)
    .where(and(eq(schema.workEntries.timesheetId, ts.id), sql`${schema.workEntries.status} <> 'void'`));
  if (entries.some((e) => e.status === "open")) out.push({ code: "open", message: "An entry has no clock out." });
  if (entries.some((e) => e.rateStatus === "missing")) out.push({ code: "rate_missing", message: "An entry has no applicable rate. Ask admin to set one." });
  if (entries.some((e) => e.rateStatus === "conflict")) out.push({ code: "rate_conflict", message: "An entry has conflicting rates. Admin must resolve them." });
  const dayRateDates = entries.filter((e) => e.status === "closed" && e.rateUnit === "day").map((e) => localDate(e.startAt));
  if (new Set(dayRateDates).size < dayRateDates.length) {
    out.push({ code: "day_rate_twice", message: "Two day-rate entries fall on the same day, so the day rate would be paid twice. Combine them or remove one." });
  }
  return out;
}

/** Key-order independent comparison (jsonb does not preserve key order). */
function sameSnapshot(a: Snapshot, b: Snapshot) {
  const canon = (s: Snapshot) =>
    JSON.stringify(
      s.entries.map((e) => [e.id, e.projectId, e.jobRoleId, e.startAt, e.endAt, e.durationSeconds, e.breakMinutes ?? 0, e.rateId, e.rateUnit ?? "hour", e.appliedRate, e.value, e.rateStatus, e.status]),
    );
  return canon(a) === canon(b);
}

/**
 * Approve a specific version (F16). If the live data differs from that version (e.g. a rate was
 * changed by admin), a new version is created and approval is refused so the manager reviews it.
 */
export async function approveTimesheet(actor: Actor, timesheetId: string, versionNo: number) {
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    await assertCanManageWorker(tx, actor, ts.workerId);
    const blockers = await approvalBlockers(tx, actor, ts);
    if (blockers.length) throw new AppError(blockers.map((b) => b.message).join(" "), "approval_blocked");
    if (ts.currentVersion !== versionNo) throw new AppError("The timesheet changed. Review the latest version before approving.");

    const [version] = await tx
      .select()
      .from(schema.timesheetVersions)
      .where(and(eq(schema.timesheetVersions.timesheetId, ts.id), eq(schema.timesheetVersions.versionNo, versionNo)));
    const live = await buildSnapshot(tx, ts.id);
    if (!sameSnapshot(version.snapshot as Snapshot, live.snapshot)) {
      const v = await createVersion(tx, actor, ts, "rates_changed", "Rates or entries changed after submission");
      return { approved: false as const, newVersion: v };
    }
    await tx
      .update(schema.timesheetVersions)
      .set({ approvedAt: new Date(), approvedBy: actor.memberId })
      .where(eq(schema.timesheetVersions.id, version.id));
    await tx
      .update(schema.timesheets)
      .set({ status: "approved", approvedVersion: versionNo, updatedAt: new Date() })
      .where(eq(schema.timesheets.id, ts.id));
    await audit(tx, actor, "timesheet.approved", "timesheet", ts.id, { version: versionNo });
    return { approved: true as const, version: versionNo };
  });
}

/**
 * Reopen an approved timesheet (F16). Requires authority and a reason; produces a new version that
 * needs renewed approval. Earlier approved versions remain immutable for traceability.
 */
export async function reopenTimesheet(actor: Actor, timesheetId: string, reason: string) {
  if (!reason.trim()) throw new AppError("A reason is required to reopen an approved timesheet.");
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    await assertCanManageWorker(tx, actor, ts.workerId);
    if (ts.status !== "approved") throw new AppError("Only approved timesheets can be reopened.");
    await tx.update(schema.timesheets).set({ status: "submitted", updatedAt: new Date() }).where(eq(schema.timesheets.id, ts.id));
    const v = await createVersion(tx, actor, { ...ts, status: "submitted" }, "reopened", reason.trim());
    await addComment(tx, actor, ts, "reopen", reason.trim());
    await audit(tx, actor, "timesheet.reopened", "timesheet", ts.id, { version: v, reason });
    return v;
  });
}

/** Called after a manager edits entries of a submitted timesheet: the revised version is reviewed (F13). */
export async function versionAfterCorrection(tx: Tx, actor: Actor, timesheetId: string, reason: string) {
  const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
  if (ts.status === "submitted") await createVersion(tx, actor, ts, "manager_correction", reason);
}

/** Worker adds a comment or a correction request for an entry (workers never edit entries). */
export async function addWorkerComment(actor: Actor, timesheetId: string, body: string, entryId?: string) {
  if (!body.trim()) throw new AppError("Write a message first.");
  return db.transaction(async (tx) => {
    const ts = await lockTimesheet(tx, timesheetId, actor.companyId);
    const own = ts.workerId === actor.memberId;
    if (!own) await assertCanManageWorker(tx, actor, ts.workerId);
    await addComment(tx, actor, ts, own && entryId ? "correction_request" : "comment", body.trim(), entryId);
  });
}
