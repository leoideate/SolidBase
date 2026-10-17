import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { AppError } from "../errors";
import { hashPin, isValidPin, verifyPin } from "../auth/pin";
import { audit } from "./audit";

export const SESSION_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Authenticate by username + PIN. Deactivated members cannot start sessions (Q02).
 * Login never clocks in (F01).
 */
export async function authenticate(usernameRaw: string, pin: string) {
  const username = usernameRaw.trim().toLowerCase();
  const generic = new AppError("Username or PIN is incorrect.", "auth");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!user) throw generic;
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("Too many attempts. Try again in 15 minutes or ask your administrator to reset your PIN.", "locked");
  }
  if (!(await verifyPin(user.pinHash, pin))) {
    const failed = user.failedAttempts + 1;
    const lock = failed >= MAX_FAILED;
    await db
      .update(schema.users)
      .set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(schema.users.id, user.id));
    throw generic;
  }
  const [member] = await db
    .select()
    .from(schema.companyMembers)
    .where(and(eq(schema.companyMembers.userId, user.id), eq(schema.companyMembers.isActive, true)));
  if (!member) throw new AppError("This account is deactivated.", "inactive");
  await db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));
  return { user, member };
}

/** Creates a session row and returns the raw cookie token. Only the hash is stored. */
export async function newSession(userId: string, memberId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, memberId, expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
}

export async function actorFromToken(token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  const rows = await db
    .select({ u: schema.users, m: schema.companyMembers })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.companyMembers, eq(schema.companyMembers.id, schema.sessions.memberId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, sql`now()`)));
  const row = rows[0];
  if (!row || !row.m.isActive) return null;
  return actorOf(row.u, row.m);
}

export function actorOf(u: typeof schema.users.$inferSelect, m: typeof schema.companyMembers.$inferSelect): Actor {
  return {
    userId: u.id,
    memberId: m.id,
    companyId: m.companyId,
    displayName: u.displayName,
    username: u.username,
    workerCode: m.workerCode,
    isWorker: m.isWorker,
    isManager: m.isManager,
    isAdmin: m.isAdmin,
    isIt: m.isIt,
    mustChangePin: u.mustChangePin,
  };
}

export async function changeOwnPin(actor: Actor, currentPin: string, newPin: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId));
  if (!user || !(await verifyPin(user.pinHash, currentPin))) throw new AppError("Current PIN is incorrect.");
  if (!isValidPin(newPin)) throw new AppError("New PIN must be 6 digits and not a simple sequence like 123456.");
  if (newPin === currentPin) throw new AppError("Choose a PIN different from the current one.");
  await db
    .update(schema.users)
    .set({ pinHash: await hashPin(newPin), mustChangePin: false })
    .where(eq(schema.users.id, actor.userId));
  await audit(db, actor, "user.pin_changed", "user", actor.userId);
}

/** Kill all sessions of a user, e.g. on deactivation or PIN reset. */
export async function revokeUserSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}
