/**
 * Development seed. Wipes the database and creates a demo company that reproduces the ARD p.6
 * example (P001/P002; Dumper driver €28, Digger driver €30, General operative €25).
 *
 * Demo logins (development only; all use PIN 246810):
 *   admin      Business administrator
 *   sean       Site manager for pat and mary
 *   niamh      Site manager for tom
 *   pat, mary, tom   Workers
 *   owner      CostMaster (all projects, export enabled), no other access
 *   it.support IT / technical support (no business data without a grant)
 */
import { loadEnv } from "./env";

loadEnv();
if (process.argv.includes("--test")) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { seedDemo } = await import("../tests/fixtures");
const { pg } = await import("../src/server/db");
const result = await seedDemo({ withSubmittedWeek: true });
console.log(`Seeded company "${result.companyName}". Users: ${Object.keys(result.members).join(", ")} (PIN 246810)`);
await pg.end();
