"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, getActor, homePath, requireActor } from "@/server/auth/session";
import { authenticate, changeOwnPin } from "@/server/services/auth";
import { actorOf } from "@/server/services/auth";
import { AppError } from "@/server/errors";
import { str } from "@/server/action";
import type { ActionState } from "@/server/action";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let dest = "/";
  try {
    const { user, member } = await authenticate(str(fd, "username"), str(fd, "pin"));
    await createSession(user.id, member.id);
    dest = user.mustChangePin ? "/change-pin" : homePath(actorOf(user, member));
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect(dest);
}

export async function changePinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor({ allowPinChange: true });
  const next = str(fd, "newPin");
  if (next !== str(fd, "confirmPin")) return { error: "The new PINs do not match." };
  try {
    await changeOwnPin(actor, str(fd, "currentPin"), next);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect(homePath(actor));
}

/** Ends the session only. An open shift stays open (F01, F06). */
export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function currentHome() {
  const a = await getActor();
  return a ? homePath(a) : "/login";
}
