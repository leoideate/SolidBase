import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { assertCanReadWorker, canManageWorker, managedWorkerIds, readableWorkerIds } from "../authz";
import { NotFound } from "../errors";
import { sumMoney } from "@/lib/money";
import { weekEndInstant, weekStartOf } from "@/lib/time";
import { approvalBlockers } from "./timesheets";

const e = schema.workEntries;

export async function settingsFor(companyId: string) {
  const [s] = await db.select().from(schema.companySettings).where(eq(schema.companySettings.companyId, companyId));
  return { longShiftHours: Number(s?.longShiftHours ?? 14), managerExportEnabled: s?.managerExportEnabled ?? false };
}

export type EntryRow = Awaited<ReturnType<typeof entriesForTimesheets>>[number];

async function entriesForTimesheets(timesheetIds: string[]) {
  if (timesheetIds.length === 0) return [];
  return db
    .select({
      id: e.id,
      timesheetId: e.timesheetId,
      workerId: e.workerId,
      projectId: e.projectId,
      projectCode: schema.projects.code,
      projectName: schema.projects.name,
      siteRef: schema.projects.siteRef,
      jobRoleId: e.jobRoleId,
      roleCode: schema.jobRoles.code,
      roleName: schema.jobRoles.name,
      startAt: e.startAt,
      endAt: e.endAt,
      durationSeconds: e.durationSeconds,
      breakMinutes: e.breakMinutes,
      note: e.note,
      appliedRate: e.appliedRate,
      rateUnit: e.rateUnit,
      currency: e.currency,
      value: e.value,
      rateStatus: e.rateStatus,
      status: e.status,
      source: e.source,
      splitGroupId: e.splitGroupId,
    })
    .from(e)
    .innerJoin(schema.projects, eq(schema.projects.id, e.projectId))
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, e.jobRoleId))
    .where(and(inArray(e.timesheetId, timesheetIds), ne(e.status, "void")))
    .orderBy(asc(e.startAt));
}

export type Flag = { code: string; label: string };

/** Explainable review flags (ARD p.14). They never change hours automatically. */
export function entryFlags(row: Pick<EntryRow, "status" | "startAt" | "durationSeconds" | "rateStatus">, longShiftHours: number, now = new Date()): Flag[] {
  const flags: Flag[] = [];
  const limit = longShiftHours * 3600;
  if (row.status === "open") {
    const openFor = (now.getTime() - row.startAt.getTime()) / 1000;
    if (weekStartOf(row.startAt) !== weekStartOf(now) || openFor > limit) flags.push({ code: "missing_clock_out", label: "Missing clock out" });
  } else if ((row.durationSeconds ?? 0) > limit) {
    flags.push({ code: "unusual_duration", label: `Over ${longShiftHours}h` });
  }
  if (row.rateStatus === "missing") flags.push({ code: "rate_missing", label: "No rate" });
  if (row.rateStatus === "conflict") flags.push({ code: "rate_conflict", label: "Rate conflict" });
  return flags;
}

export type Breakdown = { projectCode: string; projectName: string; roleName: string; seconds: number; rate: string | null; rateUnit: "hour" | "day"; value: string | null };

/** Summary by project, role and rate. The CSV keeps individual entries; this is display only (ARD p.6). */
export function breakdown(rows: EntryRow[]): Breakdown[] {
  const map = new Map<string, Breakdown & { values: (string | null)[] }>();
  for (const r of rows) {
    if (r.status !== "closed") continue;
    const k = `${r.projectCode}|${r.roleCode}|${r.appliedRate}|${r.rateUnit}`;
    const cur = map.get(k) ?? { projectCode: r.projectCode, projectName: r.projectName, roleName: r.roleName, seconds: 0, rate: r.appliedRate, rateUnit: r.rateUnit, value: null, values: [] };
    cur.seconds += r.durationSeconds ?? 0;
    cur.values.push(r.value);
    map.set(k, cur);
  }
  return [...map.values()].map(({ values, ...b }) => ({ ...b, value: values.some((v) => v == null) ? null : sumMoney(values) }));
}

export function totals(rows: EntryRow[]) {
  const closed = rows.filter((r) => r.status === "closed");
  const seconds = closed.reduce((s, r) => s + (r.durationSeconds ?? 0), 0);
  const unpriced = closed.some((r) => r.value == null);
  return { seconds, value: sumMoney(closed.map((r) => r.value)), unpriced, openCount: rows.filter((r) => r.status === "open").length };
}

/** Weekly view for one worker (F10, F13, F17). Access checked on the underlying record. */
export async function workerWeek(actor: Actor, workerId: string, weekStart: string) {
  await assertCanReadWorker(db, actor, workerId);
  const [worker] = await db
    .select({ id: schema.companyMembers.id, name: schema.users.displayName, workerCode: schema.companyMembers.workerCode, hasPin: sql<boolean>`${schema.users.pinHash} is not null` })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.id, workerId));
  const [ts] = await db
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.workerId, workerId), eq(schema.timesheets.weekStart, weekStart)));
  return { worker, ...(await timesheetDetail(actor, ts ?? null)), weekStart };
}

export async function timesheetById(actor: Actor, timesheetId: string) {
  const [ts] = await db
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.id, timesheetId), eq(schema.timesheets.companyId, actor.companyId)));
  if (!ts) throw new NotFound("Timesheet not found.");
  return workerWeek(actor, ts.workerId, ts.weekStart);
}

async function timesheetDetail(actor: Actor, ts: typeof schema.timesheets.$inferSelect | null) {
  const settings = await settingsFor(actor.companyId);
  if (!ts) {
    return { timesheet: null, entries: [], versions: [], comments: [], revisions: [], settings, blockers: [], canManage: false, weekEnded: false };
  }
  const entries = await entriesForTimesheets([ts.id]);
  const versions = await db
    .select({
      v: schema.timesheetVersions,
      createdByName: sql<string | null>`(select u.display_name from company_members m join users u on u.id = m.user_id where m.id = ${schema.timesheetVersions.createdBy})`,
      approvedByName: sql<string | null>`(select u.display_name from company_members m join users u on u.id = m.user_id where m.id = ${schema.timesheetVersions.approvedBy})`,
    })
    .from(schema.timesheetVersions)
    .where(eq(schema.timesheetVersions.timesheetId, ts.id))
    .orderBy(desc(schema.timesheetVersions.versionNo));
  const comments = await db
    .select({ c: schema.timesheetComments, author: schema.users.displayName })
    .from(schema.timesheetComments)
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.timesheetComments.authorId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.timesheetComments.timesheetId, ts.id))
    .orderBy(asc(schema.timesheetComments.createdAt));
  const entryIds = (await db.select({ id: e.id }).from(e).where(eq(e.timesheetId, ts.id))).map((r) => r.id);
  const revisions = entryIds.length
    ? await db
        .select({ r: schema.entryRevisions, editor: schema.users.displayName })
        .from(schema.entryRevisions)
        .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.entryRevisions.editedBy))
        .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
        .where(inArray(schema.entryRevisions.entryId, entryIds))
        .orderBy(desc(schema.entryRevisions.editedAt))
    : [];
  const canManage = await canManageWorker(db, actor, ts.workerId);
  const blockers = canManage ? await approvalBlockers(db, actor, ts) : [];
  return { timesheet: ts, entries, versions, comments, revisions, settings, blockers, canManage, weekEnded: new Date() >= weekEndInstant(ts.weekStart) };
}

/** Own weekly history (F17). */
export async function workerHistory(actor: Actor, workerId: string) {
  await assertCanReadWorker(db, actor, workerId);
  const sheets = await db
    .select()
    .from(schema.timesheets)
    .where(eq(schema.timesheets.workerId, workerId))
    .orderBy(desc(schema.timesheets.weekStart))
    .limit(104);
  const rows = await entriesForTimesheets(sheets.map((s) => s.id));
  return sheets.map((s) => ({ ...s, ...totals(rows.filter((r) => r.timesheetId === s.id)) }));
}

/** Manager queue: submitted timesheets and unresolved issues for assigned workers only (F12). */
export async function managerQueue(actor: Actor) {
  const ids = await managedWorkerIds(db, actor);
  if (ids.length === 0) return { submitted: [], issues: [], overdue: [], returned: [] };
  const settings = await settingsFor(actor.companyId);
  const sheets = await db
    .select({ ts: schema.timesheets, name: schema.users.displayName, workerCode: schema.companyMembers.workerCode })
    .from(schema.timesheets)
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.timesheets.workerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(and(inArray(schema.timesheets.workerId, ids), ne(schema.timesheets.status, "approved")))
    .orderBy(asc(schema.timesheets.weekStart));
  const rows = await entriesForTimesheets(sheets.map((s) => s.ts.id));
  const now = new Date();
  const withTotals = sheets.map((s) => {
    const mine = rows.filter((r) => r.timesheetId === s.ts.id);
    const flags = mine.flatMap((r) => entryFlags(r, settings.longShiftHours, now).map((f) => ({ ...f, entryId: r.id })));
    return { ...s, ...totals(mine), flags, entryCount: mine.length };
  });
  return {
    submitted: withTotals.filter((s) => s.ts.status === "submitted"),
    returned: withTotals.filter((s) => s.ts.status === "returned"),
    overdue: withTotals.filter((s) => s.ts.status === "draft" && s.entryCount > 0 && now >= weekEndInstant(s.ts.weekStart)),
    issues: withTotals.filter((s) => s.flags.length > 0),
  };
}

export type TeamFilters = { weekStart?: string; workerId?: string; projectId?: string; status?: string };

/**
 * Team overview with filters (F17). Admin: whole business. Manager: assigned workers only.
 * Approved totals by project and role only include approved timesheets.
 */
export async function teamOverview(actor: Actor, f: TeamFilters) {
  const ids = await readableWorkerIds(db, actor);
  const workers = ids.length
    ? await db
        .select({ id: schema.companyMembers.id, name: schema.users.displayName, workerCode: schema.companyMembers.workerCode })
        .from(schema.companyMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
        .where(inArray(schema.companyMembers.id, ids))
        .orderBy(asc(schema.users.displayName))
    : [];
  const scoped = f.workerId ? ids.filter((i) => i === f.workerId) : ids;
  if (scoped.length === 0) return { workers, sheets: [], byProjectRole: [], approved: { seconds: 0, value: "0.00" } };
  const conds = [inArray(schema.timesheets.workerId, scoped)];
  if (f.weekStart) conds.push(eq(schema.timesheets.weekStart, f.weekStart));
  if (f.status && (schema.TIMESHEET_STATUSES as readonly string[]).includes(f.status)) {
    conds.push(eq(schema.timesheets.status, f.status as (typeof schema.TIMESHEET_STATUSES)[number]));
  }
  const sheets = await db
    .select({ ts: schema.timesheets, name: schema.users.displayName, workerCode: schema.companyMembers.workerCode })
    .from(schema.timesheets)
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.timesheets.workerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(and(...conds))
    .orderBy(desc(schema.timesheets.weekStart), asc(schema.users.displayName))
    .limit(500);
  let rows = await entriesForTimesheets(sheets.map((s) => s.ts.id));
  if (f.projectId) rows = rows.filter((r) => r.projectId === f.projectId);
  const approvedIds = new Set(sheets.filter((s) => s.ts.status === "approved").map((s) => s.ts.id));
  const approvedRows = rows.filter((r) => approvedIds.has(r.timesheetId));
  const t = totals(approvedRows);
  return {
    workers,
    sheets: sheets
      .map((s) => ({ ...s, ...totals(rows.filter((r) => r.timesheetId === s.ts.id)) }))
      .filter((s) => !f.projectId || s.seconds > 0 || s.openCount > 0),
    byProjectRole: breakdown(approvedRows),
    approved: { seconds: t.seconds, value: t.value },
  };
}

/** Lookups for filter dropdowns and correction forms, scoped to the company. */
export async function companyLookups(companyId: string) {
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.companyId, companyId)).orderBy(asc(schema.projects.code));
  const roles = await db.select().from(schema.jobRoles).where(eq(schema.jobRoles.companyId, companyId)).orderBy(asc(schema.jobRoles.name));
  return { projects, roles };
}

/** Approved entries for a set of workers/projects within a date range (shared by CSV and CostMaster). */
export async function approvedEntries(p: { companyId: string; workerIds?: string[]; projectIds?: string[]; fromWeek?: string; toWeek?: string }) {
  const conds = [eq(schema.timesheets.companyId, p.companyId), eq(schema.timesheets.status, "approved"), eq(e.status, "closed")];
  if (p.workerIds) {
    if (p.workerIds.length === 0) return [];
    conds.push(inArray(e.workerId, p.workerIds));
  }
  if (p.projectIds) {
    if (p.projectIds.length === 0) return [];
    conds.push(inArray(e.projectId, p.projectIds));
  }
  if (p.fromWeek) conds.push(gte(schema.timesheets.weekStart, p.fromWeek));
  if (p.toWeek) conds.push(lte(schema.timesheets.weekStart, p.toWeek));
  return db
    .select({
      entryId: e.id,
      timesheetId: e.timesheetId,
      approvedVersion: schema.timesheets.approvedVersion,
      weekStart: schema.timesheets.weekStart,
      workerId: e.workerId,
      workerCode: schema.companyMembers.workerCode,
      workerName: schema.users.displayName,
      projectId: e.projectId,
      projectCode: schema.projects.code,
      projectName: schema.projects.name,
      siteRef: schema.projects.siteRef,
      roleCode: schema.jobRoles.code,
      roleName: schema.jobRoles.name,
      startAt: e.startAt,
      endAt: e.endAt,
      durationSeconds: e.durationSeconds,
      breakMinutes: e.breakMinutes,
      note: e.note,
      appliedRate: e.appliedRate,
      rateUnit: e.rateUnit,
      currency: e.currency,
      value: e.value,
      approvedAt: schema.timesheetVersions.approvedAt,
      approvedByName: sql<string>`(select u.display_name from company_members m join users u on u.id = m.user_id where m.id = ${schema.timesheetVersions.approvedBy})`,
    })
    .from(e)
    .innerJoin(schema.timesheets, eq(schema.timesheets.id, e.timesheetId))
    .innerJoin(
      schema.timesheetVersions,
      and(eq(schema.timesheetVersions.timesheetId, schema.timesheets.id), eq(schema.timesheetVersions.versionNo, schema.timesheets.approvedVersion)),
    )
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, e.workerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .innerJoin(schema.projects, eq(schema.projects.id, e.projectId))
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, e.jobRoleId))
    .where(and(...conds))
    .orderBy(asc(e.startAt), asc(schema.users.displayName));
}
