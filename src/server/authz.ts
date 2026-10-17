import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { schema } from "./db";
import type { Actor } from "./actor";
import { Forbidden, NotFound } from "./errors";

/**
 * The single place where record access scope is computed (ARD section 2).
 * Services must filter every query through these helpers so screens, CSV exports and direct
 * record requests all get the same restrictions (Q02, T03, T08).
 */

/** Workers the actor may manage (review, correct, return, approve). Admin: whole company. */
export async function managedWorkerIds(tx: DbOrTx, actor: Actor): Promise<string[]> {
  if (actor.isAdmin) {
    const rows = await tx
      .select({ id: schema.companyMembers.id })
      .from(schema.companyMembers)
      .where(and(eq(schema.companyMembers.companyId, actor.companyId), eq(schema.companyMembers.isWorker, true)));
    return rows.map((r) => r.id);
  }
  if (!actor.isManager) return [];
  const rows = await tx
    .select({ id: schema.managerAssignments.workerId })
    .from(schema.managerAssignments)
    .where(
      and(eq(schema.managerAssignments.companyId, actor.companyId), eq(schema.managerAssignments.managerId, actor.memberId)),
    );
  return rows.map((r) => r.id);
}

/** Active, admin-issued support access for an IT member (A05). */
export async function hasSupportAccess(tx: DbOrTx, actor: Actor): Promise<boolean> {
  if (!actor.isIt) return false;
  const rows = await tx
    .select({ id: schema.supportGrants.id })
    .from(schema.supportGrants)
    .where(
      and(
        eq(schema.supportGrants.companyId, actor.companyId),
        eq(schema.supportGrants.itMemberId, actor.memberId),
        isNull(schema.supportGrants.revokedAt),
        gt(schema.supportGrants.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Workers whose records the actor may read in a team context. Includes managed workers and,
 * for IT with an active support grant, all company workers (read-only).
 */
export async function readableWorkerIds(tx: DbOrTx, actor: Actor): Promise<string[]> {
  const ids = new Set(await managedWorkerIds(tx, actor));
  if (await hasSupportAccess(tx, actor)) {
    const rows = await tx
      .select({ id: schema.companyMembers.id })
      .from(schema.companyMembers)
      .where(eq(schema.companyMembers.companyId, actor.companyId));
    rows.forEach((r) => ids.add(r.id));
  }
  return [...ids];
}

async function assertSameCompany(tx: DbOrTx, actor: Actor, workerId: string) {
  const [m] = await tx
    .select({ companyId: schema.companyMembers.companyId })
    .from(schema.companyMembers)
    .where(eq(schema.companyMembers.id, workerId));
  if (!m || m.companyId !== actor.companyId) throw new NotFound("Worker not found.");
}

export async function canManageWorker(tx: DbOrTx, actor: Actor, workerId: string): Promise<boolean> {
  if (actor.isAdmin) {
    const [m] = await tx
      .select({ id: schema.companyMembers.id })
      .from(schema.companyMembers)
      .where(and(eq(schema.companyMembers.id, workerId), eq(schema.companyMembers.companyId, actor.companyId)));
    return !!m;
  }
  if (!actor.isManager) return false;
  const rows = await tx
    .select({ id: schema.managerAssignments.id })
    .from(schema.managerAssignments)
    .where(
      and(
        eq(schema.managerAssignments.companyId, actor.companyId),
        eq(schema.managerAssignments.managerId, actor.memberId),
        eq(schema.managerAssignments.workerId, workerId),
      ),
    );
  return rows.length > 0;
}

export async function assertCanManageWorker(tx: DbOrTx, actor: Actor, workerId: string) {
  await assertSameCompany(tx, actor, workerId);
  if (!(await canManageWorker(tx, actor, workerId))) throw new Forbidden();
}

export async function canReadWorker(tx: DbOrTx, actor: Actor, workerId: string): Promise<boolean> {
  if (actor.isWorker && actor.memberId === workerId) return true;
  if (await canManageWorker(tx, actor, workerId)) return true;
  return hasSupportAccess(tx, actor);
}

export async function assertCanReadWorker(tx: DbOrTx, actor: Actor, workerId: string) {
  await assertSameCompany(tx, actor, workerId);
  if (!(await canReadWorker(tx, actor, workerId))) throw new Forbidden();
}

export type CostScope = { allProjects: boolean; projectIds: string[]; canExport: boolean };

/**
 * CostMaster scope (C01). Admin sees all projects. Otherwise only explicit grants count; being a
 * manager never grants CostMaster, and CostMaster never grants approval (A01, C04).
 */
export async function costScope(tx: DbOrTx, actor: Actor): Promise<CostScope | null> {
  if (actor.isAdmin) return { allProjects: true, projectIds: [], canExport: true };
  const grants = await tx
    .select()
    .from(schema.costmasterGrants)
    .where(and(eq(schema.costmasterGrants.companyId, actor.companyId), eq(schema.costmasterGrants.memberId, actor.memberId)));
  if (grants.length === 0) return null;
  return {
    allProjects: grants.some((g) => g.projectId === null),
    projectIds: grants.filter((g) => g.projectId).map((g) => g.projectId!),
    canExport: grants.some((g) => g.canExport),
  };
}

/** Project IDs (within the company) visible in a cost scope. */
export async function costProjectIds(tx: DbOrTx, actor: Actor, scope: CostScope): Promise<string[]> {
  if (scope.allProjects) {
    const rows = await tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.companyId, actor.companyId));
    return rows.map((r) => r.id);
  }
  if (scope.projectIds.length === 0) return [];
  const rows = await tx
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.companyId, actor.companyId), inArray(schema.projects.id, scope.projectIds)));
  return rows.map((r) => r.id);
}

/** Manager export is only available when admin enables it (ARD section 2). */
export async function canExportTeam(tx: DbOrTx, actor: Actor): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (!actor.isManager) return false;
  const [s] = await tx
    .select({ on: schema.companySettings.managerExportEnabled })
    .from(schema.companySettings)
    .where(eq(schema.companySettings.companyId, actor.companyId));
  return !!s?.on;
}

export function requireAdmin(actor: Actor) {
  if (!actor.isAdmin) throw new Forbidden("Administrator access required.");
}
