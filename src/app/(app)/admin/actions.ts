"use server";

import { bool, runAction, str } from "@/server/action";
import type { ActionState } from "@/server/action";
import * as admin from "@/server/services/admin";
import { personFromForm } from "@/server/services/people";

const R = { revalidate: "/admin" };
const roles = (fd: FormData) => ({ isWorker: bool(fd, "isWorker"), isManager: bool(fd, "isManager"), isAdmin: bool(fd, "isAdmin"), isIt: bool(fd, "isIt") });

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.createUser(a, { username: str(fd, "username"), workerCode: str(fd, "workerCode"), pin: str(fd, "pin"), person: personFromForm(fd), ...roles(fd) });
    return "User created. Give them their username and temporary PIN; they will set their own PIN on first login.";
  }, R);
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.updateUser(a, str(fd, "memberId"), { workerCode: str(fd, "workerCode"), person: personFromForm(fd), ...roles(fd) });
  }, R);
}

export async function setActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    const active = str(fd, "active") === "true";
    await admin.setUserActive(a, str(fd, "memberId"), active);
    return active ? "Account reactivated." : "Account deactivated. History is kept; existing sessions were ended.";
  }, R);
}

export async function resetPinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.resetPin(a, str(fd, "memberId"), str(fd, "pin"));
    return "PIN reset. The user must choose a new PIN at next login.";
  }, R);
}

export async function allocationsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.setWorkerAllocations(a, str(fd, "memberId"), fd.getAll("projectIds").map(String), fd.getAll("jobRoleIds").map(String));
  }, R);
}

export async function assignManagerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.assignManager(a, str(fd, "managerId"), str(fd, "workerId"), str(fd, "kind") === "cover" ? "cover" : "primary");
    return "Assignment saved.";
  }, R);
}

export async function unassignManagerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.unassignManager(a, str(fd, "managerId"), str(fd, "workerId"));
    return "Assignment removed. Access was revoked immediately.";
  }, R);
}

export async function grantCostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.grantCostmaster(a, str(fd, "memberId"), str(fd, "projectId") || null, bool(fd, "canExport"));
    return "CostMaster access granted.";
  }, R);
}

export async function revokeCostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.revokeCostmaster(a, str(fd, "grantId"));
    return "CostMaster access removed.";
  }, R);
}

export async function saveProjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.saveProject(a, {
      id: str(fd, "id") || undefined,
      code: str(fd, "code"),
      name: str(fd, "name"),
      siteRef: str(fd, "siteRef"),
      clientId: str(fd, "clientId") || null,
      principal: str(fd, "principal"),
      projectType: str(fd, "projectType"),
      description: str(fd, "description"),
      address: str(fd, "address"),
      startDate: str(fd, "startDate"),
      endDate: str(fd, "endDate"),
      isActive: bool(fd, "isActive"),
    });
  }, R);
}

export async function saveClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.saveClient(a, { id: str(fd, "id") || undefined, name: str(fd, "name"), isActive: bool(fd, "isActive") });
  }, R);
}

export async function saveRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.saveJobRole(a, { id: str(fd, "id") || undefined, code: str(fd, "code"), name: str(fd, "name"), isActive: bool(fd, "isActive") });
  }, R);
}

export async function addRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.addRate(a, {
      jobRoleId: str(fd, "jobRoleId"),
      workerId: str(fd, "workerId") || null,
      projectId: str(fd, "projectId") || null,
      hourlyRate: str(fd, "hourlyRate"),
      unit: str(fd, "unit"),
      effectiveFrom: str(fd, "effectiveFrom"),
      effectiveTo: str(fd, "effectiveTo") || null,
    });
    return "Rate added. Unapproved entries were re-priced; approved history is unchanged.";
  }, R);
}

export async function endRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.endRate(a, str(fd, "rateId"), str(fd, "effectiveTo"));
    return "Rate end date set.";
  }, R);
}

export async function settingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.updateSettings(a, { longShiftHours: str(fd, "longShiftHours"), managerExportEnabled: bool(fd, "managerExportEnabled") });
  }, R);
}

export async function grantSupportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.grantSupport(a, str(fd, "itMemberId"), str(fd, "reason"), Number(str(fd, "hours")));
    return "Support access granted. It expires automatically.";
  }, R);
}

export async function revokeSupportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (a) => {
    await admin.revokeSupport(a, str(fd, "grantId"));
    return "Support access revoked.";
  }, R);
}
