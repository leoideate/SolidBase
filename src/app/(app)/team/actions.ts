"use server";

import { runAction, str } from "@/server/action";
import type { ActionState } from "@/server/action";
import { AppError } from "@/server/errors";
import { addEntry, correctEntry, voidEntry } from "@/server/services/corrections";
import { adminSubmitTimesheet, approveTimesheet, reopenTimesheet, returnTimesheet } from "@/server/services/timesheets";
import { parseLocalDateTime } from "@/lib/time";

function times(fd: FormData, requireEnd: boolean) {
  const startAt = parseLocalDateTime(str(fd, "startAt"));
  const endRaw = str(fd, "endAt");
  const endAt = endRaw ? parseLocalDateTime(endRaw) : null;
  if (!startAt) throw new AppError("Enter a valid start date and time.");
  if (endRaw && !endAt) throw new AppError("Enter a valid end date and time.");
  if (requireEnd && !endAt) throw new AppError("Enter an end date and time.");
  return { startAt, endAt };
}

export async function correctAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const { startAt, endAt } = times(fd, false);
    await correctEntry(actor, str(fd, "entryId"), { projectId: str(fd, "projectId"), jobRoleId: str(fd, "jobRoleId"), startAt, endAt }, str(fd, "reason"));
    return "Correction saved. The worker can see the original and revised values.";
  }, { revalidate: "/team" });
}

export async function addEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const { startAt, endAt } = times(fd, true);
    await addEntry(actor, str(fd, "workerId"), { projectId: str(fd, "projectId"), jobRoleId: str(fd, "jobRoleId"), startAt, endAt: endAt! }, str(fd, "reason"));
    return "Entry added.";
  }, { revalidate: "/team" });
}

export async function voidAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await voidEntry(actor, str(fd, "entryId"), str(fd, "reason"));
    return "Entry removed from the timesheet. History is kept.";
  }, { revalidate: "/team" });
}

export async function returnAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await returnTimesheet(actor, str(fd, "timesheetId"), Number(str(fd, "versionNo")), str(fd, "comment"));
    return "Returned to the worker.";
  }, { revalidate: "/team" });
}

export async function approveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const r = await approveTimesheet(actor, str(fd, "timesheetId"), Number(str(fd, "versionNo")));
    if (!r.approved) throw new AppError(`Rates or entries changed since this version. Review version ${r.newVersion} and approve again.`);
    return `Approved version ${r.version}. It is now locked.`;
  }, { revalidate: "/team" });
}

export async function reopenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const v = await reopenTimesheet(actor, str(fd, "timesheetId"), str(fd, "reason"));
    return `Reopened as version ${v}. It needs approval again before export.`;
  }, { revalidate: "/team" });
}

export async function adminSubmitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const v = await adminSubmitTimesheet(actor, str(fd, "timesheetId"), str(fd, "reason"));
    return `Submitted on the worker's behalf (version ${v}).`;
  }, { revalidate: "/team" });
}
