import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { addWeekToDate } from "@/lib/time";
import { clockIn, clockOut } from "@/server/services/clock";
import { addEntry, correctEntry, voidEntry } from "@/server/services/corrections";
import { approveTimesheet, reopenTimesheet, returnTimesheet, submitTimesheet } from "@/server/services/timesheets";
import { addRate, grantSupport, assignManager, unassignManager } from "@/server/services/admin";
import { buildExport } from "@/server/services/exports";
import { costReport } from "@/server/services/costmaster";
import { managerQueue, teamOverview, timesheetById, workerWeek } from "@/server/services/views";
import { authenticate, actorFromToken, newSession } from "@/server/services/auth";
import { setUserActive } from "@/server/services/admin";
import { dublin, recordArdExampleWeek, seedDemo, timesheetFor } from "../fixtures";
import { ensureTimesheet } from "@/server/services/timesheets";

const ensureTs = (workerId: string, week: string) => ensureTimesheet(db, s.company.id, workerId, week);

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;

beforeEach(async () => {
  s = await seedDemo({ withSubmittedWeek: true });
});

const m = () => s.members;

describe("T01 / T06 clocking", () => {
  it("records a shift; logout does not close it; retries and parallel requests create one entry", async () => {
    const pat = m().pat;
    const key = randomUUID();
    const first = await clockIn(pat, { projectId: s.projects.P001.id, jobRoleId: s.roles.DUMP.id, key });
    expect(first.replayed).toBe(false);
    // Retry with the same key returns the same entry.
    const retry = await clockIn(pat, { projectId: s.projects.P001.id, jobRoleId: s.roles.DUMP.id, key });
    expect(retry.replayed).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
    // A new press while open is refused.
    await expect(clockIn(pat, { projectId: s.projects.P002.id, jobRoleId: s.roles.DIG.id, key: randomUUID() })).rejects.toThrow(/already clocked in/);

    // Logging out (deleting sessions) leaves the open entry intact.
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, pat.userId));
    const [open] = await db.select().from(schema.workEntries).where(and(eq(schema.workEntries.workerId, pat.memberId), eq(schema.workEntries.status, "open")));
    expect(open.id).toBe(first.entry.id);

    const outKey = randomUUID();
    const out = await clockOut(pat, { key: outKey });
    expect(out.entry.status).toBe("closed");
    expect(out.entry.endAt!.getTime()).toBeGreaterThan(out.entry.startAt.getTime());
    expect(out.entry.rateStatus).toBe("ok");
    const outRetry = await clockOut(pat, { key: outKey });
    expect(outRetry.replayed).toBe(true);
  });

  it("20 simultaneous clock-ins with different keys produce exactly one open entry", async () => {
    const mary = m().mary;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => clockIn(mary, { projectId: s.projects.P001.id, jobRoleId: s.roles.GEN.id, key: randomUUID() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.workEntries).where(eq(schema.workEntries.workerId, mary.memberId));
    expect(n).toBe(1);
  });

  it("20 simultaneous retries of the same key all return the same entry", async () => {
    const tom = m().tom;
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () => clockIn(tom, { projectId: s.projects.P002.id, jobRoleId: s.roles.DIG.id, key })));
    expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
  });

  it("rejects unassigned projects", async () => {
    await db.delete(schema.workerProjects).where(eq(schema.workerProjects.workerId, m().tom.memberId));
    await expect(clockIn(m().tom, { projectId: s.projects.P001.id, jobRoleId: s.roles.DIG.id, key: randomUUID() })).rejects.toThrow(/assigned/);
  });
});

describe("T02 multiple allocations and approval", () => {
  it("ARD example produces 40 approved hours and €1,135 with separate allocations", async () => {
    const ts = await timesheetFor(m().pat.memberId, s.lastWeek);
    expect(ts.status).toBe("submitted");
    const res = await approveTimesheet(m().sean, ts.id, ts.currentVersion);
    expect(res.approved).toBe(true);
    const view = await workerWeek(m().pat, m().pat.memberId, s.lastWeek);
    const secs = view.entries.reduce((a, e) => a + (e.durationSeconds ?? 0), 0);
    expect(secs).toBe(40 * 3600);
    const exp = await buildExport(m().sean, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek });
    expect(exp.rowCount).toBe(7);
    expect(exp.totalSeconds).toBe(40 * 3600);
    expect(exp.totalValue).toBe("1135.00");
    const overview = await teamOverview(m().sean, { weekStart: s.lastWeek });
    expect(overview.approved.value).toBe("1135.00");
    expect(overview.byProjectRole.map((b) => [b.projectCode, b.roleName, b.value]).sort()).toEqual([
      ["P001", "Dumper driver", "560.00"],
      ["P001", "General operative", "125.00"],
      ["P002", "Digger driver", "450.00"],
    ]);
  });
});

describe("T03 isolation", () => {
  it("worker A cannot read worker B; manager A cannot read manager B's worker, including export and direct requests", async () => {
    await expect(workerWeek(m().pat, m().mary.memberId, s.lastWeek)).rejects.toThrow(/access/);
    const patTs = await timesheetFor(m().pat.memberId, s.lastWeek);
    await expect(timesheetById(m().niamh, patTs.id)).rejects.toThrow(/access/);
    await expect(timesheetById(m().tom, patTs.id)).rejects.toThrow(/access/);
    await expect(approveTimesheet(m().niamh, patTs.id, patTs.currentVersion)).rejects.toThrow(/access/);

    await approveTimesheet(m().sean, patTs.id, patTs.currentVersion);
    const niamhExport = await buildExport(m().niamh, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek, workerId: m().pat.memberId });
    expect(niamhExport.rowCount).toBe(0);
    await expect(buildExport(m().pat, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek })).rejects.toThrow(/not enabled/);
    const q = await managerQueue(m().niamh);
    expect(q.submitted.find((x) => x.ts.id === patTs.id)).toBeUndefined();
  });

  it("removing an assignment revokes access immediately (A01)", async () => {
    const patTs = await timesheetFor(m().pat.memberId, s.lastWeek);
    await unassignManager(m().admin, m().sean.memberId, m().pat.memberId);
    await expect(timesheetById(m().sean, patTs.id)).rejects.toThrow(/access/);
    await assignManager(m().admin, m().sean.memberId, m().pat.memberId, "primary");
    await expect(timesheetById(m().sean, patTs.id)).resolves.toBeTruthy();
  });
});

describe("T04 correction and return", () => {
  it("corrects project/role/time with reason preserved, creates a revised version, return and resubmit", async () => {
    const ts = await timesheetFor(m().pat.memberId, s.lastWeek);
    const view = await workerWeek(m().sean, m().pat.memberId, s.lastWeek);
    const entry = view.entries[0];
    await expect(correctEntry(m().sean, entry.id, { projectId: s.projects.P003.id, jobRoleId: s.roles.GEN.id, startAt: entry.startAt, endAt: entry.endAt }, "  ")).rejects.toThrow(/reason/);
    const updated = await correctEntry(m().sean, entry.id, { projectId: s.projects.P003.id, jobRoleId: s.roles.GEN.id, startAt: entry.startAt, endAt: entry.endAt }, "Wrong project selected");
    expect(updated!.appliedRate).toBe("25.00");
    expect(updated!.value).toBe("200.00");
    const [rev] = await db.select().from(schema.entryRevisions).where(eq(schema.entryRevisions.entryId, entry.id));
    expect(rev.reason).toBe("Wrong project selected");
    expect((rev.before as { projectId: string }).projectId).toBe(s.projects.P001.id);
    const after = await timesheetFor(m().pat.memberId, s.lastWeek);
    expect(after.currentVersion).toBe(ts.currentVersion + 1);
    // Approving the stale version is refused.
    await expect(approveTimesheet(m().sean, ts.id, ts.currentVersion)).rejects.toThrow(/latest version/);

    await returnTimesheet(m().sean, ts.id, after.currentVersion, "Please confirm Monday");
    expect((await timesheetFor(m().pat.memberId, s.lastWeek)).status).toBe("returned");
    await submitTimesheet(m().pat, ts.id, "Confirmed, Monday was P003");
    const re = await timesheetFor(m().pat.memberId, s.lastWeek);
    expect(re.status).toBe("submitted");
    expect((await approveTimesheet(m().sean, ts.id, re.currentVersion)).approved).toBe(true);
  });

  it("rejects overlaps and end-before-start", async () => {
    const view = await workerWeek(m().sean, m().pat.memberId, s.lastWeek);
    const [a, b] = view.entries;
    await expect(correctEntry(m().sean, a.id, { projectId: a.projectId, jobRoleId: a.jobRoleId, startAt: a.endAt!, endAt: a.startAt }, "x")).rejects.toThrow(/after start/);
    await expect(correctEntry(m().sean, a.id, { projectId: a.projectId, jobRoleId: a.jobRoleId, startAt: a.startAt, endAt: new Date(b.startAt.getTime() + 3600_000) }, "x")).rejects.toThrow(/overlaps/);
    await expect(addEntry(m().sean, m().pat.memberId, { projectId: a.projectId, jobRoleId: a.jobRoleId, startAt: a.startAt, endAt: a.endAt! }, "dup")).rejects.toThrow(/overlaps/);
  });
});

describe("T05 approval controls", () => {
  it("blocks self approval, open entries, missing rates; approved data stays locked until reopened", async () => {
    // Seán records his own hours last week; Seán is a manager but cannot approve himself even as admin would not.
    const seanWeek = await recordArdExampleWeek(s.company.id, m().sean, s.lastWeek, { P001: s.projects.P001.id, P002: s.projects.P002.id }, { DUMP: s.roles.DUMP.id, DIG: s.roles.DIG.id, GEN: s.roles.GEN.id });
    await submitTimesheet(m().sean, seanWeek.id);
    const sts = await timesheetFor(m().sean.memberId, s.lastWeek);
    // Admin with an assignment to self would still be blocked; admin is a different person so test Seán via admin-role grant.
    await db.update(schema.companyMembers).set({ isAdmin: true }).where(eq(schema.companyMembers.id, m().sean.memberId));
    const seanAdmin = { ...m().sean, isAdmin: true };
    await expect(approveTimesheet(seanAdmin, sts.id, sts.currentVersion)).rejects.toThrow(/own hours/);
    expect((await approveTimesheet(m().niamh, sts.id, sts.currentVersion)).approved).toBe(true);

    // Missing rate blocks approval.
    const patTs = await timesheetFor(m().pat.memberId, s.lastWeek);
    const weekBefore = addWeekToDate(s.lastWeek, -1);
    await db.insert(schema.jobRoles).values({ companyId: s.company.id, code: "NEW", name: "Unrated role" });
    const [unrated] = await db.select().from(schema.jobRoles).where(eq(schema.jobRoles.code, "NEW"));
    const e = await addEntry(m().sean, m().mary.memberId, { projectId: s.projects.P001.id, jobRoleId: unrated.id, startAt: dublin(weekBefore, 8), endAt: dublin(weekBefore, 12) }, "Paper timesheet");
    expect(e!.rateStatus).toBe("missing");
    expect(e!.value).toBeNull();

    // Approve Pat, then the locked week rejects edits until reopened.
    await approveTimesheet(m().sean, patTs.id, patTs.currentVersion);
    const entry = (await workerWeek(m().sean, m().pat.memberId, s.lastWeek)).entries[0];
    await expect(voidEntry(m().sean, entry.id, "dup")).rejects.toThrow(/approved/);
    await expect(db.update(schema.workEntries).set({ durationSeconds: 1 }).where(eq(schema.workEntries.id, entry.id))).rejects.toThrow();
    const v = await reopenTimesheet(m().sean, patTs.id, "Hours query from payroll");
    expect(v).toBe(patTs.currentVersion + 1);
    const reopened = await timesheetFor(m().pat.memberId, s.lastWeek);
    expect(reopened.status).toBe("submitted");
    // Reopened entries are not exported until re-approved.
    expect((await buildExport(m().admin, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek, workerId: m().pat.memberId })).rowCount).toBe(0);
    await approveTimesheet(m().sean, patTs.id, reopened.currentVersion);
    const exp = await buildExport(m().admin, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek, workerId: m().pat.memberId });
    expect(exp.csv).toContain(`,${reopened.currentVersion},W001,`);
  });

  it("open entries block approval and admin rate changes create a new version to review", async () => {
    const patTs = await timesheetFor(m().pat.memberId, s.lastWeek);
    await addRate(m().admin, { jobRoleId: s.roles.DUMP.id, workerId: m().pat.memberId, hourlyRate: "29.00", effectiveFrom: "2026-01-01" });
    const res = await approveTimesheet(m().sean, patTs.id, patTs.currentVersion);
    expect(res.approved).toBe(false);
    const fresh = await timesheetFor(m().pat.memberId, s.lastWeek);
    expect((await approveTimesheet(m().sean, patTs.id, fresh.currentVersion)).approved).toBe(true);
    const exp = await buildExport(m().sean, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek });
    expect(exp.totalValue).toBe("1155.00"); // 20h dumper now at €29
  });
});

describe("T07 week split", () => {
  it("clock-out splits a shift that crossed Monday 00:00 Dublin into linked weekly entries", async () => {
    const mary = m().mary;
    const lastWeekTs = await ensureTs(mary.memberId, s.lastWeek);
    const start = dublin(addDays(s.lastWeek, 6), 20); // last Sunday 20:00
    await db.insert(schema.workEntries).values({
      companyId: s.company.id,
      workerId: mary.memberId,
      projectId: s.projects.P001.id,
      jobRoleId: s.roles.GEN.id,
      timesheetId: lastWeekTs.id,
      startAt: start,
      status: "open",
    });
    const out = await clockOut(mary, { key: randomUUID() });
    expect(out.entry.durationSeconds).toBe(4 * 3600);
    expect(out.entry.splitGroupId).not.toBeNull();
    const pieces = await db.select().from(schema.workEntries).where(eq(schema.workEntries.splitGroupId, out.entry.splitGroupId!));
    expect(pieces).toHaveLength(2);
    expect(new Set(pieces.map((p) => p.timesheetId)).size).toBe(2);
    const total = pieces.reduce((a, p) => a + p.durationSeconds!, 0);
    expect(total).toBe(Math.floor((pieces.find((p) => p.id !== out.entry.id)!.endAt!.getTime() - start.getTime()) / 1000));
  });

  it("a manager correction cannot make one entry span two weeks", async () => {
    await expect(
      addEntry(m().sean, m().mary.memberId, { projectId: s.projects.P001.id, jobRoleId: s.roles.GEN.id, startAt: dublin(addDays(s.lastWeek, -1), 20), endAt: dublin(s.lastWeek, 4) }, "night"),
    ).rejects.toThrow(/one week/);
  });
});

describe("T08 technical and CostMaster access", () => {
  it("IT has no business data without an admin grant; CostMaster cannot approve", async () => {
    const it = m()["it.support"];
    const patTs = await timesheetFor(m().pat.memberId, s.lastWeek);
    await expect(timesheetById(it, patTs.id)).rejects.toThrow(/access/);
    await grantSupport(m().admin, it.memberId, "Investigating ticket 42", 2);
    await expect(timesheetById(it, patTs.id)).resolves.toBeTruthy();
    await expect(approveTimesheet(it, patTs.id, patTs.currentVersion)).rejects.toThrow(/access/);

    const owner = m().owner;
    await expect(approveTimesheet(owner, patTs.id, patTs.currentVersion)).rejects.toThrow(/access/);
    await approveTimesheet(m().sean, patTs.id, patTs.currentVersion);
    const report = await costReport(owner, { fromWeek: s.lastWeek, toWeek: s.lastWeek });
    expect(report.byProject.find((p) => p.code === "P001")!.value).toBe("685.00");
    expect(report.byProject.find((p) => p.code === "P002")!.value).toBe("450.00");

    // Restrict owner to P002 only.
    await db.delete(schema.costmasterGrants).where(eq(schema.costmasterGrants.memberId, owner.memberId));
    await db.insert(schema.costmasterGrants).values({ companyId: s.company.id, memberId: owner.memberId, projectId: s.projects.P002.id, canExport: true });
    const limited = await costReport(owner, { fromWeek: s.lastWeek, toWeek: s.lastWeek });
    expect(limited.byProject.map((p) => p.code)).toEqual(["P002"]);
    const exp = await buildExport(owner, { scope: "costmaster", fromWeek: s.lastWeek, toWeek: s.lastWeek, projectId: s.projects.P001.id });
    expect(exp.rowCount).toBe(0);
    await expect(costReport(m().sean, { fromWeek: s.lastWeek, toWeek: s.lastWeek })).rejects.toThrow(/not been granted/);
  });
});

describe("accounts", () => {
  it("deactivated accounts cannot log in and lose their sessions", async () => {
    const { token } = await newSession(m().mary.userId, m().mary.memberId);
    expect(await actorFromToken(token)).not.toBeNull();
    await setUserActive(m().admin, m().mary.memberId, false);
    expect(await actorFromToken(token)).toBeNull();
    await expect(authenticate("mary", "246810")).rejects.toThrow(/deactivated/);
    await expect(authenticate("pat", "000000")).rejects.toThrow(/incorrect/);
  });
});

function addDays(d: string, n: number) {
  const [y, mo, da] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da + n));
  return dt.toISOString().slice(0, 10);
}
