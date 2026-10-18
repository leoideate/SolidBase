/**
 * Sets a new temporary PIN for a user from the server shell, for when nobody who could reset it in
 * the app can log in (e.g. the only administrator forgot their PIN). Also clears a lockout and ends
 * the user's sessions. They must choose their own PIN at the next login. Audited.
 *
 *   npx tsx scripts/reset-pin.ts --username ideate --pin 482913
 */
import { parseArgs } from "node:util";
import { loadEnv } from "./env";

loadEnv();

const { values } = parseArgs({ options: { username: { type: "string" }, pin: { type: "string" } } });

function fail(msg: string): never {
  console.error(msg);
  console.error("Usage: npx tsx scripts/reset-pin.ts --username <login> --pin <6 digits>");
  process.exit(1);
}

const username = values.username?.trim().toLowerCase() ?? "";
const pin = values.pin ?? "";
if (!username) fail("--username is required.");

const { eq } = await import("drizzle-orm");
const { db, pg, schema } = await import("../src/server/db");
const { hashPin, isValidPin } = await import("../src/server/auth/pin");
if (!isValidPin(pin)) fail("--pin must be 6 digits and not a simple sequence like 123456.");

try {
  const done = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.username, username));
    if (!user) return null;
    await tx
      .update(schema.users)
      .set({ pinHash: await hashPin(pin), mustChangePin: true, failedAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    const [member] = await tx.select().from(schema.companyMembers).where(eq(schema.companyMembers.userId, user.id));
    await tx.insert(schema.auditLog).values({
      companyId: member?.companyId ?? null,
      actorId: null,
      action: "user.pin_reset",
      targetType: "member",
      targetId: member?.id ?? user.id,
      details: { username, via: "scripts/reset-pin.ts" },
    });
    return { user, member };
  });
  if (!done) {
    const all = await db.select({ u: schema.users.username }).from(schema.users);
    console.error(`No user "${username}". Existing usernames: ${all.map((r) => r.u).join(", ") || "(none)"}`);
    process.exitCode = 1;
  } else {
    const inactive = done.member && !done.member.isActive ? " Note: this account is deactivated, so it still can't log in." : "";
    console.log(`PIN reset for "${username}". Log in with the new PIN; you'll be asked to choose your own.${inactive}`);
  }
} finally {
  await pg.end();
}
