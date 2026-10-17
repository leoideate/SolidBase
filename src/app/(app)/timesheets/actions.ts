"use server";

import { runAction, str } from "@/server/action";
import type { ActionState } from "@/server/action";
import { addWorkerComment, submitTimesheet } from "@/server/services/timesheets";

export async function submitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const v = await submitTimesheet(actor, str(fd, "timesheetId"), str(fd, "comment"));
    return `Submitted (version ${v}). Your manager will review it.`;
  }, { revalidate: "/timesheets" });
}

export async function commentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await addWorkerComment(actor, str(fd, "timesheetId"), str(fd, "body"), str(fd, "entryId") || undefined);
    return "Message sent.";
  }, { revalidate: "/timesheets" });
}
