import { beforeEach, expect, it } from "vitest";
import { db } from "@/server/db";
import { assignManager } from "@/server/services/admin";
import { enterCrewHours } from "@/server/services/crew";
import { approvalBlockers, approveTimesheet, reopenTimesheet, submitOnBehalf, submitTimesheet } from "@/server/services/timesheets";
import { dublin, recordArdExampleWeek, seedDemo, timesheetFor } from "../fixtures";
import { addEntry } from "@/server/services/corrections";

let s: Awaited<ReturnType<typeof seedDemo>>;
beforeEach(async () => { s = await seedDemo(); });

it("blocks the recorder and a different submitter; an independent authorised manager approves", async () => {
  const m = s.members;
  await assignManager(m.admin, m.niamh.memberId, m.pat.memberId, "cover");
  await enterCrewHours(m.sean, { date: s.lastWeek, projectId: s.projects.P001.id, rows: [
    { workerId: m.pat.memberId, jobRoleId: s.roles.DUMP.id, start: "07:00", end: "15:00" },
  ] });
  const ts = await timesheetFor(m.pat.memberId, s.lastWeek);
  const v = await submitOnBehalf(m.admin, ts.id, "Worker confirmed the recorded hours");
  await expect(approveTimesheet(m.sean, ts.id, v)).rejects.toThrow(/entered, corrected or submitted/);
  await expect(approveTimesheet(m.admin, ts.id, v)).rejects.toThrow(/entered, corrected or submitted/);
  const current = await timesheetFor(m.pat.memberId, s.lastWeek);
  expect((await approvalBlockers(db, m.sean, current)).map(b => b.code)).toContain("participant");
  expect((await approveTimesheet(m.niamh, ts.id, v)).approved).toBe(true);
  // Reopening creates another version but must not erase the original submitter.
  const reopened = await reopenTimesheet(m.niamh, ts.id, "Independent review requested");
  await expect(approveTimesheet(m.admin, ts.id, reopened)).rejects.toThrow(/entered, corrected or submitted/);
});

it("blocks an admin who entered hours even when the worker submits", async () => {
  const m = s.members;
  await addEntry(m.admin, m.pat.memberId, {
    projectId: s.projects.P001.id, jobRoleId: s.roles.DUMP.id,
    startAt: dublin(s.lastWeek, 7), endAt: dublin(s.lastWeek, 15),
  }, "Recorded from the site register");
  const ts = await timesheetFor(m.pat.memberId, s.lastWeek);
  const v = await submitTimesheet(m.pat, ts.id);
  await expect(approveTimesheet(m.admin, ts.id, v)).rejects.toThrow(/entered, corrected or submitted/);
  expect((await approveTimesheet(m.sean, ts.id, v)).approved).toBe(true);
});

it("never lets an admin approve their own timesheet", async () => {
  const m = s.members;
  await recordArdExampleWeek(s.company.id, m.sean, s.lastWeek,
    { P001: s.projects.P001.id, P002: s.projects.P002.id },
    { DUMP: s.roles.DUMP.id, DIG: s.roles.DIG.id, GEN: s.roles.GEN.id });
  const ts = await timesheetFor(m.sean.memberId, s.lastWeek);
  const v = await submitTimesheet(m.sean, ts.id);
  await expect(approveTimesheet({ ...m.sean, isAdmin: true }, ts.id, v)).rejects.toThrow(/own hours/);
  expect((await approveTimesheet(m.niamh, ts.id, v)).approved).toBe(true);
});
