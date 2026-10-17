import { TZDate } from "@date-fns/tz";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/server/db";
import type { Actor } from "../src/server/actor";
import { hashPin } from "../src/server/auth/pin";
import { actorOf } from "../src/server/services/auth";
import { priceEntry } from "../src/server/services/rates";
import { ensureTimesheet, submitTimesheet } from "../src/server/services/timesheets";
import { addWeekToDate, TZ, weekDays, weekStartOf } from "../src/lib/time";

export const DEMO_PIN = "246810";

export async function resetDb() {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`,
  );
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  // TRUNCATE bypasses the row-level append-only and lock triggers (development and tests only).
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
}

/** Dublin wall-clock time on a given date. */
export function dublin(date: string, hh: number, mm = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, TZ).getTime());
}

type MemberSpec = { username: string; name: string; code: string; worker?: boolean; manager?: boolean; admin?: boolean; it?: boolean };

export async function seedDemo(opts: { withSubmittedWeek?: boolean } = {}) {
  await resetDb();
  const [company] = await db.insert(schema.companies).values({ name: "Demo Construction Ltd" }).returning();
  await db.insert(schema.companySettings).values({ companyId: company.id, longShiftHours: "14", managerExportEnabled: true });
  await db.insert(schema.moduleEnablements).values([
    { companyId: company.id, module: "attendance", enabled: true },
    { companyId: company.id, module: "costmaster", enabled: true },
  ]);

  const pinHash = await hashPin(DEMO_PIN);
  const specs: MemberSpec[] = [
    { username: "admin", name: "Aoife Byrne", code: "A001", admin: true },
    { username: "sean", name: "Seán Murphy", code: "M001", manager: true, worker: true },
    { username: "niamh", name: "Niamh Kelly", code: "M002", manager: true },
    { username: "pat", name: "Pat Doyle", code: "W001", worker: true },
    { username: "mary", name: "Mary Walsh", code: "W002", worker: true },
    { username: "tom", name: "Tom O'Brien", code: "W003", worker: true },
    { username: "owner", name: "Declan Ryan", code: "C001" },
    { username: "it.support", name: "IT Support", code: "IT01", it: true },
  ];
  const members: Record<string, Actor> = {};
  for (const s of specs) {
    const [u] = await db.insert(schema.users).values({ username: s.username, displayName: s.name, pinHash, mustChangePin: false }).returning();
    const [m] = await db
      .insert(schema.companyMembers)
      .values({
        companyId: company.id,
        userId: u.id,
        workerCode: s.code,
        isWorker: !!s.worker,
        isManager: !!s.manager,
        isAdmin: !!s.admin,
        isIt: !!s.it,
      })
      .returning();
    members[s.username] = actorOf(u, m);
  }

  const projects = await db
    .insert(schema.projects)
    .values([
      { companyId: company.id, code: "P001", name: "Main Street Apartments", siteRef: "D08-MS" },
      { companyId: company.id, code: "P002", name: "Harbour Road Depot", siteRef: "D01-HR" },
      { companyId: company.id, code: "P003", name: "Riverside School Extension", siteRef: null },
    ])
    .returning();
  const roles = await db
    .insert(schema.jobRoles)
    .values([
      { companyId: company.id, code: "DUMP", name: "Dumper driver" },
      { companyId: company.id, code: "DIG", name: "Digger driver" },
      { companyId: company.id, code: "GEN", name: "General operative" },
    ])
    .returning();
  const P = Object.fromEntries(projects.map((p) => [p.code, p]));
  const R = Object.fromEntries(roles.map((r) => [r.code, r]));
  const admin = members.admin;
  await db.insert(schema.rates).values([
    { companyId: company.id, jobRoleId: R.DUMP.id, hourlyRate: "28.00", effectiveFrom: "2026-01-01", createdBy: admin.memberId },
    { companyId: company.id, jobRoleId: R.DIG.id, hourlyRate: "30.00", effectiveFrom: "2026-01-01", createdBy: admin.memberId },
    { companyId: company.id, jobRoleId: R.GEN.id, hourlyRate: "25.00", effectiveFrom: "2026-01-01", createdBy: admin.memberId },
  ]);

  // Workers may clock against these projects/roles.
  for (const w of ["pat", "mary", "tom", "sean"]) {
    const id = members[w].memberId;
    await db.insert(schema.workerProjects).values(projects.map((p) => ({ companyId: company.id, workerId: id, projectId: p.id })));
    await db.insert(schema.workerJobRoles).values(roles.map((r) => ({ companyId: company.id, workerId: id, jobRoleId: r.id })));
  }
  await db.insert(schema.managerAssignments).values([
    { companyId: company.id, managerId: members.sean.memberId, workerId: members.pat.memberId, createdBy: admin.memberId },
    { companyId: company.id, managerId: members.sean.memberId, workerId: members.mary.memberId, createdBy: admin.memberId },
    { companyId: company.id, managerId: members.niamh.memberId, workerId: members.tom.memberId, createdBy: admin.memberId },
    // Seán's own hours are reviewed by Niamh: nobody approves their own time (A03).
    { companyId: company.id, managerId: members.niamh.memberId, workerId: members.sean.memberId, createdBy: admin.memberId },
  ]);
  await db.insert(schema.costmasterGrants).values({ companyId: company.id, memberId: members.owner.memberId, projectId: null, canExport: true, createdBy: admin.memberId });

  const lastWeek = addWeekToDate(weekStartOf(new Date()), -1);
  if (opts.withSubmittedWeek) {
    await recordArdExampleWeek(company.id, members.pat, lastWeek, { P001: P.P001.id, P002: P.P002.id }, { DUMP: R.DUMP.id, DIG: R.DIG.id, GEN: R.GEN.id });
    await submitTimesheet(members.pat, (await timesheetFor(members.pat.memberId, lastWeek)).id);
  }
  return { company, companyName: company.name, members, projects: P, roles: R, lastWeek };
}

export async function timesheetFor(workerId: string, weekStart: string) {
  const [ts] = await db.select().from(schema.timesheets).where(sql`${schema.timesheets.workerId} = ${workerId} and ${schema.timesheets.weekStart} = ${weekStart}`);
  return ts;
}

/** ARD p.6: P001 Dumper 20h, P002 Digger 15h, P001 General 5h = 40h, €1,135. */
export async function recordArdExampleWeek(
  companyId: string,
  worker: Actor,
  weekStart: string,
  p: { P001: string; P002: string },
  r: { DUMP: string; DIG: string; GEN: string },
) {
  const d = weekDays(weekStart);
  const plan: [string, number, number, string, string][] = [
    [d[0], 7, 15, p.P001, r.DUMP], // 8h
    [d[1], 7, 15, p.P001, r.DUMP], // 8h
    [d[2], 7, 11, p.P001, r.DUMP], // 4h -> 20h dumper
    [d[2], 12, 16, p.P002, r.DIG], // 4h
    [d[3], 7, 15, p.P002, r.DIG], // 8h
    [d[4], 7, 10, p.P002, r.DIG], // 3h -> 15h digger
    [d[4], 10, 15, p.P001, r.GEN], // 5h general
  ];
  const ts = await ensureTimesheet(db, companyId, worker.memberId, weekStart);
  for (const [day, from, to, projectId, jobRoleId] of plan) {
    const startAt = dublin(day, from);
    const endAt = dublin(day, to);
    const durationSeconds = (to - from) * 3600;
    const pricing = await priceEntry(db, { companyId, workerId: worker.memberId, projectId, jobRoleId, startAt, durationSeconds });
    await db.insert(schema.workEntries).values({
      companyId,
      workerId: worker.memberId,
      projectId,
      jobRoleId,
      timesheetId: ts.id,
      startAt,
      endAt,
      durationSeconds,
      status: "closed",
      source: "clock",
      ...pricing,
    });
  }
  return ts;
}

export async function memberActor(memberId: string): Promise<Actor> {
  const [row] = await db
    .select({ u: schema.users, m: schema.companyMembers })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.id, memberId));
  return actorOf(row.u, row.m);
}
