import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { requireAdmin } from "../authz";
import { NotFound } from "../errors";

/** Read models for admin screens. Admin only, scoped to the actor's company. */

export async function listMembers(actor: Actor) {
  requireAdmin(actor);
  return db
    .select({ m: schema.companyMembers, u: { id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, mustChangePin: schema.users.mustChangePin, lockedUntil: schema.users.lockedUntil, hasPin: sql<boolean>`${schema.users.pinHash} is not null` } })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.companyId, actor.companyId))
    .orderBy(desc(schema.companyMembers.isActive), asc(schema.users.displayName));
}

export async function memberDetail(actor: Actor, memberId: string) {
  requireAdmin(actor);
  const [row] = await db
    .select({ m: schema.companyMembers, u: schema.users })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(and(eq(schema.companyMembers.id, memberId), eq(schema.companyMembers.companyId, actor.companyId)));
  if (!row) throw new NotFound("User not found.");
  const projectIds = (await db.select({ id: schema.workerProjects.projectId }).from(schema.workerProjects).where(eq(schema.workerProjects.workerId, memberId))).map((r) => r.id);
  const roleIds = (await db.select({ id: schema.workerJobRoles.jobRoleId }).from(schema.workerJobRoles).where(eq(schema.workerJobRoles.workerId, memberId))).map((r) => r.id);
  const mu = alias(schema.users, "mu");
  const mm = alias(schema.companyMembers, "mm");
  const managers = await db
    .select({ a: schema.managerAssignments, name: mu.displayName })
    .from(schema.managerAssignments)
    .innerJoin(mm, eq(mm.id, schema.managerAssignments.managerId))
    .innerJoin(mu, eq(mu.id, mm.userId))
    .where(eq(schema.managerAssignments.workerId, memberId));
  const team = await db
    .select({ a: schema.managerAssignments, name: mu.displayName })
    .from(schema.managerAssignments)
    .innerJoin(mm, eq(mm.id, schema.managerAssignments.workerId))
    .innerJoin(mu, eq(mu.id, mm.userId))
    .where(eq(schema.managerAssignments.managerId, memberId));
  const costGrants = await db
    .select({ g: schema.costmasterGrants, projectCode: schema.projects.code })
    .from(schema.costmasterGrants)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.costmasterGrants.projectId))
    .where(eq(schema.costmasterGrants.memberId, memberId));
  return { ...row, projectIds, roleIds, managers, team, costGrants };
}

export async function listRates(actor: Actor) {
  requireAdmin(actor);
  return db
    .select({
      r: schema.rates,
      roleName: schema.jobRoles.name,
      projectCode: schema.projects.code,
      workerName: schema.users.displayName,
    })
    .from(schema.rates)
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, schema.rates.jobRoleId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.rates.projectId))
    .leftJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.rates.workerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.rates.companyId, actor.companyId))
    .orderBy(asc(schema.jobRoles.name), desc(schema.rates.effectiveFrom));
}

/** Entries in unapproved timesheets whose rate is missing or conflicting (ARD p.3). */
export async function rateProblems(actor: Actor) {
  requireAdmin(actor);
  return db
    .select({
      entryId: schema.workEntries.id,
      timesheetId: schema.workEntries.timesheetId,
      rateStatus: schema.workEntries.rateStatus,
      startAt: schema.workEntries.startAt,
      workerName: schema.users.displayName,
      projectCode: schema.projects.code,
      roleName: schema.jobRoles.name,
    })
    .from(schema.workEntries)
    .innerJoin(schema.timesheets, eq(schema.timesheets.id, schema.workEntries.timesheetId))
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.workEntries.workerId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.workEntries.projectId))
    .innerJoin(schema.jobRoles, eq(schema.jobRoles.id, schema.workEntries.jobRoleId))
    .where(
      and(
        eq(schema.workEntries.companyId, actor.companyId),
        eq(schema.workEntries.status, "closed"),
        ne(schema.timesheets.status, "approved"),
        or(eq(schema.workEntries.rateStatus, "missing"), eq(schema.workEntries.rateStatus, "conflict")),
      ),
    )
    .orderBy(asc(schema.workEntries.startAt))
    .limit(200);
}

export async function listSupportGrants(actor: Actor) {
  requireAdmin(actor);
  const gu = alias(schema.users, "gu");
  const gm = alias(schema.companyMembers, "gm");
  return db
    .select({ g: schema.supportGrants, itName: schema.users.displayName, grantedByName: gu.displayName })
    .from(schema.supportGrants)
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.supportGrants.itMemberId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .innerJoin(gm, eq(gm.id, schema.supportGrants.grantedBy))
    .innerJoin(gu, eq(gu.id, gm.userId))
    .where(eq(schema.supportGrants.companyId, actor.companyId))
    .orderBy(desc(schema.supportGrants.grantedAt))
    .limit(100);
}

export async function auditTrail(actor: Actor, limit = 200) {
  requireAdmin(actor);
  const rows = await db
    .select({ a: schema.auditLog, actorName: schema.users.displayName })
    .from(schema.auditLog)
    .leftJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.auditLog.actorId))
    .leftJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.auditLog.companyId, actor.companyId))
    .orderBy(desc(schema.auditLog.id))
    .limit(limit);
  // Resolve member targets to names for readability.
  const memberIds = [...new Set(rows.filter((r) => r.a.targetType === "member" && r.a.targetId).map((r) => r.a.targetId!))];
  const names = memberIds.length
    ? await db
        .select({ id: schema.companyMembers.id, name: schema.users.displayName })
        .from(schema.companyMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
        .where(inArray(schema.companyMembers.id, memberIds))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => ({ ...r, targetName: r.a.targetType === "member" ? nameOf.get(r.a.targetId ?? "") : undefined }));
}

export async function exportHistory(actor: Actor) {
  requireAdmin(actor);
  return db
    .select({ e: schema.exportsLog, name: schema.users.displayName })
    .from(schema.exportsLog)
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.exportsLog.memberId))
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.exportsLog.companyId, actor.companyId))
    .orderBy(desc(schema.exportsLog.createdAt))
    .limit(200);
}

export async function adminCounts(actor: Actor) {
  requireAdmin(actor);
  const [r] = await db.execute<{ workers: number; managers: number; projects: number; submitted: number; problems: number }>(sql`
    select
      (select count(*)::int from company_members where company_id = ${actor.companyId} and is_active and is_worker) as workers,
      (select count(*)::int from company_members where company_id = ${actor.companyId} and is_active and is_manager) as managers,
      (select count(*)::int from projects where company_id = ${actor.companyId} and is_active) as projects,
      (select count(*)::int from timesheets where company_id = ${actor.companyId} and status = 'submitted') as submitted,
      (select count(*)::int from work_entries e join timesheets t on t.id = e.timesheet_id
         where e.company_id = ${actor.companyId} and e.status = 'closed' and t.status <> 'approved' and e.rate_status in ('missing','conflict')) as problems
  `);
  return r;
}
