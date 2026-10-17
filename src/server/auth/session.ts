import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor } from "../actor";
import { actorFromToken, deleteSession, newSession } from "../services/auth";

const COOKIE = "sid";

export async function createSession(userId: string, memberId: string) {
  const { token, expiresAt } = await newSession(userId, memberId);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

/** Logout ends the session only; it never clocks out (F01, F06). */
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(COOKIE);
}

/** Current actor or null. Cached per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  return actorFromToken(jar.get(COOKIE)?.value);
});

/** Current actor or redirect to login. Enforces the first-login PIN change. */
export async function requireActor(opts: { allowPinChange?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.mustChangePin && !opts.allowPinChange) redirect("/change-pin");
  return actor;
}

export function homePath(a: Actor): string {
  if (a.isWorker) return "/clock";
  if (a.isManager) return "/team";
  if (a.isAdmin) return "/admin";
  if (a.isIt) return "/system";
  return "/costs";
}
