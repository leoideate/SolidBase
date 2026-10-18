import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { assertCanManageWorker, managedWorkerIds } from "../authz";
import { AppError, Forbidden, pgCode } from "../errors";
import { parseLocalDateTime, weekStartOf } from "@/lib/time";
import { audit } from "./audit";
import { writeAllocations } from "./admin";
import { insertManagerEntry, mapDbError } from "./corrections";
import { nextWorkerCode, personValues } from "./people";
import { checkBank, writeBank } from "./bank";
import type { BankInput } from "./bank";
import type { PersonInput } from "./people";

/**
 * Supervisor crew management. A supervisor (manager) adds workers to their own crew, chooses the
 * roles and projects they work on, and records their hours. Workers added here have no PIN: only
 * admin gives app access by setting one (Admin → Users → Set PIN).
 */

function requireSupervisor(actor: Actor) {
  if (!actor.isManager && !actor.isAdmin) throw new Forbidden("Supervisor access required.");
}

/** Login names for workers without app access are derived from the worker ID; admin can share it later. */
export function usernameFor(workerCode: string) {
  const base = workerCode.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `w.${base}`.slice(0, 40);
}

export async function listCrew(actor: Actor) {
  requireSupervisor(actor);
  const ids = await managedWorkerIds(db, actor);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: schema.companyMembers.id,
      name: schema.users.displayName,
      username: schema.users.username,
      workerCode: schema.companyMembers.workerCode,
      engagementType: schema.companyMembers.engagementType,
      mobile: schema.users.mobile,
      bankName: schema.companyMembers.bankName,
      ibanHint: schema.companyMembers.ibanLast4,
      isActive: schema.companyMembers.isActive,
      hasPin: sql<boolean>`${schema.users.pinHash} is not null`,
    })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(and(inArray(schema.companyMembers.id, ids), eq(schema.companyMembers.isWorker, true)))
    .orderBy(asc(schema.users.displayName));
  const projects = await db.select().from(schema.workerProjects).where(inArray(schema.workerProjects.workerId, ids));
  const roles = await db.select().from(schema.workerJobRoles).where(inArray(schema.workerJobRoles.workerId, ids));
  return rows.map((r) => ({
    ...r,
    projectIds: projects.filter((p) => p.workerId === r.id).map((p) => p.projectId),
    roleIds: roles.filter((x) => x.workerId === r.id).map((x) => x.jobRoleId),
  }));
}

/** Supervisor adds a worker to their crew. No PIN: the worker can't log in until admin sets one. */
export async function addCrewWorker(
  actor: Actor,
  input: { person: PersonInput; workerCode?: string; projectIds: string[]; jobRoleIds: string[]; bank?: BankInput },
) {
  requireSupervisor(actor);
  const person = personValues(input.person);
  const bank = input.bank && (input.bank.bankName.trim() || input.bank.iban.trim()) ? checkBank(input.bank) : null;
  if (input.jobRoleIds.length === 0) throw new AppError("Choose at least one role.");
  try {
    return await db.transaction(async (tx) => {
      const workerCode = input.workerCode?.trim() || (await nextWorkerCode(tx, actor.companyId));
      const [user] = await tx
        .insert(schema.users)
        .values({ username: usernameFor(workerCode), ...person.user, pinHash: null, mustChangePin: true })
        .returning();
      const [member] = await tx
        .insert(schema.companyMembers)
        .values({ companyId: actor.companyId, userId: user.id, workerCode, engagementType: person.engagementType, isWorker: true })
        .returning();
      if (actor.isManager) {
        await tx
          .insert(schema.managerAssignments)
          .values({ companyId: actor.companyId, managerId: actor.memberId, workerId: member.id, kind: "primary", createdBy: actor.memberId });
      }
      await writeAllocations(tx, actor, member.id, input.projectIds, input.jobRoleIds);
      if (bank) await writeBank(tx, actor, member, bank);
      await audit(tx, actor, "crew.worker_added", "member", member.id, { workerCode });
      return member;
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError("That worker ID is already in use.");
    throw e;
  }
}

/** Supervisor changes the roles and projects of a worker in their crew. */
export async function setCrewAllocations(actor: Actor, workerId: string, projectIds: string[], jobRoleIds: string[]) {
  requireSupervisor(actor);
  await db.transaction(async (tx) => {
    await assertCanManageWorker(tx, actor, workerId);
    await writeAllocations(tx, actor, workerId, projectIds, jobRoleIds);
  });
}

export type CrewHoursRow = { workerId: string; jobRoleId: string; start: string; end: string; breakMinutes?: number; note?: string };

export const CREW_HOURS_REASON = "Hours entered by supervisor";

/**
 * Record one day's hours for several crew members on one project, all or nothing. Times are
 * Dublin wall-clock HH:mm on `date`; an end at or before the start means the shift ended the next day.
 */
export async function enterCrewHours(actor: Actor, input: { date: string; projectId: string; rows: CrewHoursRow[] }) {
  requireSupervisor(actor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AppError("Choose a valid date.");
  if (!input.projectId) throw new AppError("Choose a project.");
  if (input.rows.length === 0) throw new AppError("Tick at least one worker.");
  const items = input.rows.map((r) => {
    const startAt = parseLocalDateTime(`${input.date}T${r.start}`);
    let endAt = parseLocalDateTime(`${input.date}T${r.end}`);
    if (!startAt || !endAt) throw new AppError("Enter start and end times as HH:MM.");
    if (endAt <= startAt) endAt = parseLocalDateTime(`${nextDay(input.date)}T${r.end}`)!;
    if (!r.jobRoleId) throw new AppError("Choose a role for every ticked worker.");
    return { workerId: r.workerId, input: { projectId: input.projectId, jobRoleId: r.jobRoleId, startAt, endAt, breakMinutes: r.breakMinutes ?? 0, note: r.note } };
  });
  try {
    return await db.transaction(async (tx) => {
      for (const it of items) await insertManagerEntry(tx, actor, it.workerId, it.input, CREW_HOURS_REASON);
      return items.length;
    });
  } catch (e) {
    mapDbError(e);
  }
}

/** Non-void entries of the given workers that start on a Dublin date, for the crew sheet. */
export async function crewEntriesOn(actor: Actor, date: string, workerIds: string[]) {
  if (workerIds.length === 0) return [];
  const from = parseLocalDateTime(`${date}T00:00`);
  const to = parseLocalDateTime(`${nextDay(date)}T00:00`);
  if (!from || !to) return [];
  return db
    .select({
      workerId: schema.workEntries.workerId,
      startAt: schema.workEntries.startAt,
      endAt: schema.workEntries.endAt,
      status: schema.workEntries.status,
      projectCode: schema.projects.code,
      roleName: schema.jobRoles.name,
      timesheetId: schema.workEntries.timesheetId,
    })
    .from(schema.workEntries)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.workEntries.projectId))
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, schema.workEntries.jobRoleId))
    .where(
      and(
        eq(schema.workEntries.companyId, actor.companyId),
        inArray(schema.workEntries.workerId, workerIds),
        gte(schema.workEntries.startAt, from),
        lt(schema.workEntries.startAt, to),
        sql`${schema.workEntries.status} <> 'void'`,
      ),
    )
    .orderBy(asc(schema.workEntries.startAt));
}

/** Timesheets of the given workers for the week containing `date` (status and link per worker). */
export async function crewTimesheetsFor(actor: Actor, date: string, workerIds: string[]) {
  if (workerIds.length === 0) return [];
  const week = weekStartOf(parseLocalDateTime(`${date}T12:00`) ?? new Date());
  return db
    .select({ id: schema.timesheets.id, workerId: schema.timesheets.workerId, status: schema.timesheets.status, weekStart: schema.timesheets.weekStart })
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.companyId, actor.companyId), eq(schema.timesheets.weekStart, week), inArray(schema.timesheets.workerId, workerIds)));
}

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
