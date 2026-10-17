import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import type { Actor } from "./actor";
import { requireActor } from "./auth/session";
import { AppError } from "./errors";
import { logError } from "./services/audit";

export type ActionState = { ok?: string; error?: string; at?: number };

/**
 * Wraps a server action: authenticates, converts expected AppErrors into a displayable message,
 * logs unexpected errors for IT, and revalidates the page.
 */
export async function runAction(
  fn: (actor: Actor) => Promise<string | void>,
  opts: { revalidate?: string } = {},
): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const ok = (await fn(actor)) ?? "Saved.";
    if (opts.revalidate) revalidatePath(opts.revalidate, "layout");
    return { ok, at: Date.now() };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message, at: Date.now() };
    await logError(db, (e as Error)?.message ?? "Unknown error", { stack: (e as Error)?.stack?.slice(0, 2000) });
    return { error: "Something went wrong and nothing was saved. Please try again.", at: Date.now() };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
