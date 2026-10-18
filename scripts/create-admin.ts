/**
 * Creates the first business administrator in an empty production database (no demo data).
 * If no company exists yet, it is created with default settings; otherwise the admin joins it.
 * The admin must choose a new PIN at first login. Safe to re-run: an existing username is refused.
 *
 *   pnpm admin:create --company "Demo Construction Ltd" --username aoife --name "Aoife Byrne" --code A001 --pin 482913
 */
import { parseArgs } from "node:util";
import { loadEnv } from "./env";

loadEnv();

const { values } = parseArgs({
  options: {
    company: { type: "string" },
    username: { type: "string" },
    name: { type: "string" },
    code: { type: "string" },
    pin: { type: "string" },
  },
});

function fail(msg: string): never {
  console.error(msg);
  console.error('Usage: pnpm admin:create --company "Company Ltd" --username <login> --name "Full Name" --code <worker id> --pin <6 digits>');
  process.exit(1);
}

const username = values.username?.trim().toLowerCase() ?? "";
const name = values.name?.trim() ?? "";
const code = values.code?.trim() ?? "";
const pin = values.pin ?? "";
if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail("--username: 3–40 letters, digits, dot, dash or underscore.");
if (!name) fail("--name is required.");
if (!code) fail("--code (worker ID) is required.");

const { eq } = await import("drizzle-orm");
const { db, pg, schema } = await import("../src/server/db");
const { hashPin, isValidPin } = await import("../src/server/auth/pin");
if (!isValidPin(pin)) fail("--pin must be 6 digits and not a simple sequence like 123456.");

try {
  const result = await db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, username));
    if (taken) throw new Error(`Username "${username}" already exists. Nothing was changed.`);

    let [company] = await tx.select().from(schema.companies).limit(1);
    if (!company) {
      const companyName = values.company?.trim();
      if (!companyName) throw new Error("No company exists yet: pass --company \"Company Ltd\".");
      [company] = await tx.insert(schema.companies).values({ name: companyName }).returning();
      await tx.insert(schema.companySettings).values({ companyId: company.id });
      await tx.insert(schema.moduleEnablements).values([
        { companyId: company.id, module: "attendance", enabled: true },
        { companyId: company.id, module: "costmaster", enabled: true },
      ]);
    }

    const [user] = await tx
      .insert(schema.users)
      .values({ username, displayName: name, pinHash: await hashPin(pin), mustChangePin: true })
      .returning();
    const [member] = await tx
      .insert(schema.companyMembers)
      .values({ companyId: company.id, userId: user.id, workerCode: code, isWorker: false, isAdmin: true })
      .returning();
    await tx.insert(schema.auditLog).values({
      companyId: company.id,
      actorId: member.id,
      action: "user.created",
      targetType: "member",
      targetId: member.id,
      details: { username, roles: ["admin"], via: "scripts/create-admin.ts" },
    });
    return { company: company.name, username };
  });
  console.log(`Created administrator "${result.username}" in "${result.company}". They must choose a new PIN at first login.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pg.end();
}
