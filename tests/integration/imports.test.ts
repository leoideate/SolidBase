import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { addWeekToDate, weekDays } from "@/lib/time";
import { importHours, importWorkers, parseCsv, parseDate, parseTime } from "@/server/services/imports";
import { listCrew } from "@/server/services/crew";
import { approveTimesheet, submitOnBehalf } from "@/server/services/timesheets";
import { seedDemo, timesheetFor } from "../fixtures";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const m = () => s.members;

beforeEach(async () => {
  s = await seedDemo();
});

const WORKERS = [
  "worker_id,first_name,middle_name,last_name,mobile,email,address,engagement_type,job_roles,projects,supervisor_username,bank_name,iban",
  'W010,Joe,,Nolan,+353871234567,joe@example.com,"1 Main St, Dublin",PAYE,DUMP;GEN,P001,sean,AIB,IE29AIBK93115212345678',
  "W011,Ann,Marie,Fox,,,,Sub-Contractor,dig,P001;P002,niamh,,",
].join("\n");

const workerByCode = async (code: string) => {
  const [w] = await db.select().from(schema.companyMembers).where(eq(schema.companyMembers.workerCode, code));
  return w;
};

describe("CSV parsing", () => {
  it("handles quotes, CRLF, BOM and semicolon files", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n')).toEqual([["a", "b"], ['x, "y"', "2"]]);
    expect(parseCsv("a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseTime("7:30")).toBe("07:30");
    expect(parseTime("07:30:00")).toBe("07:30");
    expect(parseTime("24:00")).toBeNull();
  });

  it("the published templates have the headers the importer expects", () => {
    const w = parseCsv(readFileSync("public/templates/workers_template.csv", "utf8"))[0];
    const h = parseCsv(readFileSync("public/templates/hours_template.csv", "utf8"))[0];
    expect(w).toContain("job_roles");
    expect(h).toEqual(["worker_id", "date", "project_id", "job_role", "start", "end", "break_minutes", "work_done"]);
  });
});

describe("worker import", () => {
  it("a check saves nothing; the import creates workers with roles, projects, supervisor and bank", async () => {
    const preview = await importWorkers(m().admin, WORKERS, false);
    expect(preview).toMatchObject({ committed: false, ok: 2, errors: 0 });
    expect(await workerByCode("W010")).toBeUndefined();

    const done = await importWorkers(m().admin, WORKERS, true);
    expect(done).toMatchObject({ committed: true, ok: 2 });
    const joe = await workerByCode("W010");
    expect(joe.engagementType).toBe("paye");
    expect(joe.ibanLast4).toBe("IE5678");
    const crew = await listCrew(m().sean);
    const row = crew.find((w) => w.id === joe.id)!;
    expect(row.hasPin).toBe(false);
    expect(row.roleIds.sort()).toEqual([s.roles.DUMP.id, s.roles.GEN.id].sort());
    const ann = await workerByCode("W011");
    expect((await listCrew(m().niamh)).some((w) => w.id === ann.id)).toBe(true);

    // Uploading the same file again skips existing workers.
    expect(await importWorkers(m().admin, WORKERS, true)).toMatchObject({ committed: true, ok: 0, skipped: 2 });
  });

  it("reports every bad row and saves nothing if any row is wrong", async () => {
    const csv = [
      "worker_id,first_name,last_name,job_roles,projects,supervisor_username,iban,bank_name",
      "W020,Good,Row,DUMP,P001,,,",
      "W021,,NoFirst,DUMP,,,,",
      "W022,Bad,Role,CRANE,,,,",
      "W023,Bad,Sup,DUMP,,pat,,",
      "W024,Bad,Iban,DUMP,,,IE00123,AIB",
      "W020,Dup,Row,DUMP,,,,",
    ].join("\n");
    const r = await importWorkers(m().admin, csv, true);
    expect(r.committed).toBe(false);
    expect(r.errors).toBe(5);
    expect(r.rows.find((x) => x.line === 4)?.message).toMatch(/Unknown role "CRANE"/);
    expect(r.rows.find((x) => x.line === 5)?.message).toMatch(/not a supervisor/);
    expect(r.rows.find((x) => x.line === 7)?.message).toMatch(/more than once/);
    expect(await workerByCode("W020")).toBeUndefined();
  });

  it("numbers workers automatically and refuses a missing column", async () => {
    const r = await importWorkers(m().admin, "first_name,last_name,job_roles\nAuto,One,GEN\nAuto,Two,GEN", true);
    expect(r.rows.map((x) => x.label)).toEqual(["W004 Auto One", "W005 Auto Two"]);
    await expect(importWorkers(m().admin, "first_name,last_name\nA,B", false)).rejects.toThrow(/Missing column: job_roles/);
  });

  it("is admin only", async () => {
    await expect(importWorkers(m().sean, WORKERS, false)).rejects.toThrow();
  });
});

describe("hours import", () => {
  it("imports past shifts as priced entries the supervisor can then approve", async () => {
    await importWorkers(m().admin, WORKERS, true);
    const d = weekDays(s.lastWeek);
    const csv = [
      "worker_id,date,project_id,job_role,start,end,break_minutes,work_done",
      `W010,${d[0]},P001,DUMP,07:00,15:30,30,Groundworks`,
      `w010,${d[1].split("-").reverse().join("/")},p001,gen,22:00,06:00,,Night shift`,
    ].join("\n");
    expect(await importHours(m().admin, csv, false)).toMatchObject({ committed: false, ok: 2, errors: 0 });
    const joe = await workerByCode("W010");
    expect(await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, joe.id))).toHaveLength(0);

    expect(await importHours(m().admin, csv, true)).toMatchObject({ committed: true, ok: 2 });
    const entries = await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, joe.id));
    expect(entries.map((e) => e.durationSeconds).sort()).toEqual([8 * 3600, 8 * 3600]);
    expect(entries.every((e) => e.rateStatus === "ok" && e.source === "manager")).toBe(true);
    expect(entries.find((e) => e.note === "Groundworks")?.value).toBe("224.00"); // 8h × €28

    const ts = await timesheetFor(joe.id, s.lastWeek);
    const v = await submitOnBehalf(m().sean, ts.id, "Imported hours");
    expect((await approveTimesheet(m().sean, ts.id, v)).approved).toBe(true);
  });

  it("catches unknown workers, bad times, overlaps, future shifts and approved weeks before saving", async () => {
    await importWorkers(m().admin, WORKERS, true);
    const d = weekDays(s.lastWeek);
    const next = weekDays(addWeekToDate(s.lastWeek, 2));
    const csv = [
      "worker_id,date,project_id,job_role,start,end",
      `W010,${d[2]},P001,DUMP,07:00,12:00`,
      `W010,${d[2]},P001,DUMP,11:00,13:00`,
      `W999,${d[2]},P001,DUMP,07:00,12:00`,
      `W011,${d[2]},P001,DIG,7am,12:00`,
      `W011,${next[0]},P001,DIG,07:00,12:00`,
      `W011,${d[3]},P009,DIG,07:00,12:00`,
    ].join("\n");
    const r = await importHours(m().admin, csv, true);
    expect(r.committed).toBe(false);
    const msg = (line: number) => r.rows.find((x) => x.line === line)?.message;
    expect(msg(2)).toBeUndefined();
    expect(msg(3)).toMatch(/overlaps/);
    expect(msg(4)).toMatch(/Import the workers file first/);
    expect(msg(5)).toMatch(/HH:MM/);
    expect(msg(6)).toMatch(/future/);
    expect(msg(7)).toMatch(/Unknown project "P009"/);
    const joe = await workerByCode("W010");
    expect(await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, joe.id))).toHaveLength(0);

    // An approved week is refused.
    await importHours(m().admin, `worker_id,date,project_id,job_role,start,end\nW010,${d[0]},P001,DUMP,07:00,12:00`, true);
    const ts = await timesheetFor(joe.id, s.lastWeek);
    await approveTimesheet(m().sean, ts.id, await submitOnBehalf(m().sean, ts.id, "x"));
    const again = await importHours(m().admin, `worker_id,date,project_id,job_role,start,end\nW010,${d[4]},P001,DUMP,07:00,12:00`, false);
    expect(again.rows[0].message).toMatch(/approved/);
  });
});
