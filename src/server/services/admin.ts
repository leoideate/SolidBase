import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { requireAdmin } from "../authz";
import { AppError, NotFound, pgCode } from "../errors";
import { hashPin, isValidPin } from "../auth/pin";
import { isMoney } from "@/lib/money";
import { audit } from "./audit";
import { repriceUnapproved } from "./rates";
import { revokeUserSessions } from "./auth";

/** Administration of business setup (ARD section 2, F02–F04, A01–A05). Admin only. */

async function memberInCompany(actor: Actor, memberId: string) {
  const [m] = await db
    .select()
    .from(schema.companyMembers)
    .where(and(eq(schema.companyMembers.id, memberId), eq(schema.companyMembers.companyId, actor.companyId)));
  if (!m) throw new NotFound("User not found.");
  return m;
}

export type MemberRoles = { isWorker: boolean; isManager: boolean; isAdmin: boolean; isIt: boolean };

export async function createUser(
  actor: Actor,
  input: { username: string; displayName: string; workerCode: string; pin: string } & MemberRoles,
) {
  requireAdmin(actor);
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new AppError("Username: 3–40 letters, digits, dot, dash or underscore.");
  if (!input.displayName.trim()) throw new AppError("Name is required.");
  if (!input.workerCode.trim()) throw new AppError("Worker ID is required.");
  if (!isValidPin(input.pin)) throw new AppError("Temporary PIN must be 6 digits and not a simple sequence.");
  validateRoles(input);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ username, displayName: input.displayName.trim(), pinHash: await hashPin(input.pin), mustChangePin: true })
        .returning();
      const [member] = await tx
        .insert(schema.companyMembers)
        .values({
          companyId: actor.companyId,
          userId: user.id,
          workerCode: input.workerCode.trim(),
          isWorker: input.isWorker,
          isManager: input.isManager,
          isAdmin: input.isAdmin,
          isIt: input.isIt,
        })
        .returning();
      await audit(tx, actor, "user.created", "member", member.id, { username, roles: rolesOf(input) });
      return member;
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError("That username or worker ID is already in use.");
    throw e;
  }
}

/** IT must not hold business authority through the application (A05, T08). */
function validateRoles(r: MemberRoles) {
  if (r.isIt && (r.isAdmin || r.isManager)) throw new AppError("The IT role cannot be combined with admin or manager authority.");
}

const rolesOf = (r: MemberRoles) =>
  (["isWorker", "isManager", "isAdmin", "isIt"] as const).filter((k) => r[k]).map((k) => k.slice(2).toLowerCase());

export async function updateUser(actor: Actor, memberId: string, input: { displayName: string; workerCode: string } & MemberRoles) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, memberId);
  validateRoles(input);
  if (m.id === actor.memberId && !input.isAdmin) throw new AppError("You cannot remove your own administrator access.");
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.companyMembers)
        .set({
          workerCode: input.workerCode.trim(),
          isWorker: input.isWorker,
          isManager: input.isManager,
          isAdmin: input.isAdmin,
          isIt: input.isIt,
        })
        .where(eq(schema.companyMembers.id, m.id));
      await tx.update(schema.users).set({ displayName: input.displayName.trim() }).where(eq(schema.users.id, m.userId));
      // Removing the manager role revokes all assignments (A01).
      if (m.isManager && !input.isManager) {
        await tx.delete(schema.managerAssignments).where(eq(schema.managerAssignments.managerId, m.id));
      }
      if (m.isIt && !input.isIt) {
        await tx
          .update(schema.supportGrants)
          .set({ revokedAt: new Date(), revokedBy: actor.memberId })
          .where(eq(schema.supportGrants.itMemberId, m.id));
      }
      await audit(tx, actor, "user.roles_changed", "member", m.id, { before: rolesOf(m), after: rolesOf(input) });
    });
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError("That worker ID is already in use.");
    throw e;
  }
}

/** Deactivate without deleting history (F01). Ends sessions immediately; open entries remain for managers to resolve. */
export async function setUserActive(actor: Actor, memberId: string, active: boolean) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, memberId);
  if (m.id === actor.memberId) throw new AppError("You cannot deactivate yourself.");
  await db
    .update(schema.companyMembers)
    .set({ isActive: active, deactivatedAt: active ? null : new Date() })
    .where(eq(schema.companyMembers.id, m.id));
  if (!active) await revokeUserSessions(m.userId);
  await audit(db, actor, active ? "user.reactivated" : "user.deactivated", "member", m.id);
}

export async function resetPin(actor: Actor, memberId: string, tempPin: string) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, memberId);
  if (!isValidPin(tempPin)) throw new AppError("Temporary PIN must be 6 digits and not a simple sequence.");
  await db
    .update(schema.users)
    .set({ pinHash: await hashPin(tempPin), mustChangePin: true, failedAttempts: 0, lockedUntil: null })
    .where(eq(schema.users.id, m.userId));
  await revokeUserSessions(m.userId);
  await audit(db, actor, "user.pin_reset", "member", m.id);
}

// --- Projects and roles ----------------------------------------------------

export async function saveProject(actor: Actor, input: { id?: string; code: string; name: string; siteRef?: string; isActive: boolean }) {
  requireAdmin(actor);
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new AppError("Project code and name are required.");
  try {
    if (input.id) {
      const [p] = await db
        .update(schema.projects)
        .set({ code, name: input.name.trim(), siteRef: input.siteRef?.trim() || null, isActive: input.isActive })
        .where(and(eq(schema.projects.id, input.id), eq(schema.projects.companyId, actor.companyId)))
        .returning();
      if (!p) throw new NotFound();
      await audit(db, actor, "project.updated", "project", p.id, { code, isActive: input.isActive });
      return p;
    }
    const [p] = await db
      .insert(schema.projects)
      .values({ companyId: actor.companyId, code, name: input.name.trim(), siteRef: input.siteRef?.trim() || null, isActive: input.isActive })
      .returning();
    await audit(db, actor, "project.created", "project", p.id, { code });
    return p;
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError(`Project code ${code} already exists.`);
    throw e;
  }
}

export async function saveJobRole(actor: Actor, input: { id?: string; code: string; name: string; isActive: boolean }) {
  requireAdmin(actor);
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new AppError("Role code and name are required.");
  try {
    if (input.id) {
      const [r] = await db
        .update(schema.jobRoles)
        .set({ code, name: input.name.trim(), isActive: input.isActive })
        .where(and(eq(schema.jobRoles.id, input.id), eq(schema.jobRoles.companyId, actor.companyId)))
        .returning();
      if (!r) throw new NotFound();
      await audit(db, actor, "job_role.updated", "job_role", r.id, { code, isActive: input.isActive });
      return r;
    }
    const [r] = await db.insert(schema.jobRoles).values({ companyId: actor.companyId, code, name: input.name.trim(), isActive: input.isActive }).returning();
    await audit(db, actor, "job_role.created", "job_role", r.id, { code });
    return r;
  } catch (e) {
    if (pgCode(e) === "23505") throw new AppError(`Role code ${code} already exists.`);
    throw e;
  }
}

// --- Rates -----------------------------------------------------------------

export async function addRate(
  actor: Actor,
  input: { jobRoleId: string; workerId?: string | null; projectId?: string | null; hourlyRate: string; effectiveFrom: string; effectiveTo?: string | null },
) {
  requireAdmin(actor);
  if (!isMoney(input.hourlyRate)) throw new AppError("Rate must be a positive amount with up to 2 decimals.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new AppError("Effective-from date is required.");
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) throw new AppError("Effective-to must be on or after effective-from.");
  return db.transaction(async (tx) => {
    const [role] = await tx.select().from(schema.jobRoles).where(and(eq(schema.jobRoles.id, input.jobRoleId), eq(schema.jobRoles.companyId, actor.companyId)));
    if (!role) throw new AppError("Unknown role.");
    if (input.workerId) {
      const [w] = await tx.select().from(schema.companyMembers).where(and(eq(schema.companyMembers.id, input.workerId), eq(schema.companyMembers.companyId, actor.companyId)));
      if (!w) throw new AppError("Unknown worker.");
    }
    if (input.projectId) {
      const [p] = await tx.select().from(schema.projects).where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.companyId, actor.companyId)));
      if (!p) throw new AppError("Unknown project.");
    }
    const [rate] = await tx
      .insert(schema.rates)
      .values({
        companyId: actor.companyId,
        jobRoleId: input.jobRoleId,
        workerId: input.workerId || null,
        projectId: input.projectId || null,
        hourlyRate: input.hourlyRate,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo || null,
        createdBy: actor.memberId,
      })
      .returning();
    const affected = await repriceUnapproved(tx, actor.companyId);
    await audit(tx, actor, "rate.created", "rate", rate.id, { ...input, repricedTimesheets: affected.length });
    return rate;
  });
}

/** End a rate (set effective_to). Rates are never deleted so history stays explainable. */
export async function endRate(actor: Actor, rateId: string, effectiveTo: string) {
  requireAdmin(actor);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.rates).where(and(eq(schema.rates.id, rateId), eq(schema.rates.companyId, actor.companyId)));
    if (!r) throw new NotFound("Rate not found.");
    if (effectiveTo < r.effectiveFrom) throw new AppError("End date must be on or after the start date.");
    await tx.update(schema.rates).set({ effectiveTo }).where(eq(schema.rates.id, r.id));
    const affected = await repriceUnapproved(tx, actor.companyId);
    await audit(tx, actor, "rate.ended", "rate", r.id, { effectiveTo, repricedTimesheets: affected.length });
  });
}

// --- Assignments -----------------------------------------------------------

export async function setWorkerAllocations(actor: Actor, workerId: string, projectIds: string[], jobRoleIds: string[]) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, workerId);
  await db.transaction(async (tx) => {
    await tx.delete(schema.workerProjects).where(eq(schema.workerProjects.workerId, m.id));
    await tx.delete(schema.workerJobRoles).where(eq(schema.workerJobRoles.workerId, m.id));
    if (projectIds.length) {
      const valid = await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.companyId, actor.companyId));
      const ok = new Set(valid.map((v) => v.id));
      const ids = projectIds.filter((p) => ok.has(p));
      if (ids.length) await tx.insert(schema.workerProjects).values(ids.map((projectId) => ({ companyId: actor.companyId, workerId: m.id, projectId })));
    }
    if (jobRoleIds.length) {
      const valid = await tx.select({ id: schema.jobRoles.id }).from(schema.jobRoles).where(eq(schema.jobRoles.companyId, actor.companyId));
      const ok = new Set(valid.map((v) => v.id));
      const ids = jobRoleIds.filter((r) => ok.has(r));
      if (ids.length) await tx.insert(schema.workerJobRoles).values(ids.map((jobRoleId) => ({ companyId: actor.companyId, workerId: m.id, jobRoleId })));
    }
    await audit(tx, actor, "worker.allocations_changed", "member", m.id, { projectIds, jobRoleIds });
  });
}

export async function assignManager(actor: Actor, managerId: string, workerId: string, kind: "primary" | "cover") {
  requireAdmin(actor);
  const mgr = await memberInCompany(actor, managerId);
  const wkr = await memberInCompany(actor, workerId);
  if (!mgr.isManager) throw new AppError("That user does not have the manager role.");
  if (!wkr.isWorker) throw new AppError("That user is not a worker.");
  if (mgr.id === wkr.id) throw new AppError("A manager cannot be assigned to themselves.");
  await db
    .insert(schema.managerAssignments)
    .values({ companyId: actor.companyId, managerId: mgr.id, workerId: wkr.id, kind, createdBy: actor.memberId })
    .onConflictDoUpdate({ target: [schema.managerAssignments.managerId, schema.managerAssignments.workerId], set: { kind } });
  await audit(db, actor, "assignment.added", "member", wkr.id, { managerId: mgr.id, kind });
}

/** Removing an assignment revokes access immediately (A01). */
export async function unassignManager(actor: Actor, managerId: string, workerId: string) {
  requireAdmin(actor);
  await db
    .delete(schema.managerAssignments)
    .where(
      and(
        eq(schema.managerAssignments.companyId, actor.companyId),
        eq(schema.managerAssignments.managerId, managerId),
        eq(schema.managerAssignments.workerId, workerId),
      ),
    );
  await audit(db, actor, "assignment.removed", "member", workerId, { managerId });
}

// --- Permissions -----------------------------------------------------------

export async function grantCostmaster(actor: Actor, memberId: string, projectId: string | null, canExport: boolean) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, memberId);
  if (projectId) {
    const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.companyId, actor.companyId)));
    if (!p) throw new AppError("Unknown project.");
  }
  await db
    .insert(schema.costmasterGrants)
    .values({ companyId: actor.companyId, memberId: m.id, projectId, canExport, createdBy: actor.memberId })
    .onConflictDoUpdate({ target: [schema.costmasterGrants.memberId, schema.costmasterGrants.projectId], set: { canExport } });
  await audit(db, actor, "costmaster.granted", "member", m.id, { projectId: projectId ?? "all", canExport });
}

export async function revokeCostmaster(actor: Actor, grantId: string) {
  requireAdmin(actor);
  const [g] = await db
    .delete(schema.costmasterGrants)
    .where(and(eq(schema.costmasterGrants.id, grantId), eq(schema.costmasterGrants.companyId, actor.companyId)))
    .returning();
  if (g) await audit(db, actor, "costmaster.revoked", "member", g.memberId, { projectId: g.projectId ?? "all" });
}

export async function updateSettings(actor: Actor, input: { longShiftHours: string; managerExportEnabled: boolean }) {
  requireAdmin(actor);
  const h = Number(input.longShiftHours);
  if (!Number.isFinite(h) || h < 1 || h > 48) throw new AppError("Long-shift threshold must be between 1 and 48 hours.");
  await db
    .insert(schema.companySettings)
    .values({ companyId: actor.companyId, longShiftHours: String(h), managerExportEnabled: input.managerExportEnabled })
    .onConflictDoUpdate({
      target: schema.companySettings.companyId,
      set: { longShiftHours: String(h), managerExportEnabled: input.managerExportEnabled, updatedAt: new Date() },
    });
  await audit(db, actor, "settings.updated", "company", actor.companyId, input);
}

/** Admin authorises time-limited, read-only support access for IT (A05). IT cannot grant itself. */
export async function grantSupport(actor: Actor, itMemberId: string, reason: string, hoursValid: number) {
  requireAdmin(actor);
  const m = await memberInCompany(actor, itMemberId);
  if (!m.isIt) throw new AppError("That user does not have the IT role.");
  if (m.id === actor.memberId) throw new AppError("You cannot grant support access to yourself.");
  if (!reason.trim()) throw new AppError("A reason is required.");
  if (!(hoursValid >= 1 && hoursValid <= 168)) throw new AppError("Access can last 1 to 168 hours.");
  const [g] = await db
    .insert(schema.supportGrants)
    .values({
      companyId: actor.companyId,
      itMemberId: m.id,
      reason: reason.trim(),
      grantedBy: actor.memberId,
      expiresAt: new Date(Date.now() + hoursValid * 3_600_000),
    })
    .returning();
  await audit(db, actor, "support.granted", "member", m.id, { grantId: g.id, reason, hoursValid });
}

export async function revokeSupport(actor: Actor, grantId: string) {
  requireAdmin(actor);
  const [g] = await db
    .update(schema.supportGrants)
    .set({ revokedAt: new Date(), revokedBy: actor.memberId })
    .where(and(eq(schema.supportGrants.id, grantId), eq(schema.supportGrants.companyId, actor.companyId)))
    .returning();
  if (g) await audit(db, actor, "support.revoked", "member", g.itMemberId, { grantId });
}
