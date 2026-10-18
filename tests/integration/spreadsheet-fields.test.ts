import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { addRate, createUser, saveClient, saveProject, updateUser } from "@/server/services/admin";
import { addCrewWorker, enterCrewHours } from "@/server/services/crew";
import { addEntry, correctEntry } from "@/server/services/corrections";
import { approveTimesheet, submitOnBehalf } from "@/server/services/timesheets";
import { buildExport } from "@/server/services/exports";
import { dublin, seedDemo, timesheetFor } from "../fixtures";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const m = () => s.members;

beforeEach(async () => {
  s = await seedDemo();
});

describe("client spreadsheet fields", () => {
  it("projects carry client, principal, type, description, address, SIN and dates", async () => {
    const client = await saveClient(m().admin, { name: "DLRC", isActive: true });
    await expect(saveClient(m().admin, { name: "DLRC", isActive: true })).rejects.toThrow(/already exists/);
    const p = await saveProject(m().admin, {
      code: "p010",
      name: "Hill View",
      clientId: client.id,
      principal: "DLRC",
      projectType: "bill_of_quantity",
      description: "Footpath renewal",
      address: "Hillview, Dundrum",
      siteRef: "SIN-42",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      isActive: true,
    });
    expect(p).toMatchObject({ code: "P010", clientId: client.id, projectType: "bill_of_quantity", address: "Hillview, Dundrum", siteRef: "SIN-42", endDate: "2026-12-31" });
    await expect(saveProject(m().admin, { code: "P011", name: "X", startDate: "2026-10-02", endDate: "2026-10-01", isActive: true })).rejects.toThrow(/end date/);
    await expect(saveProject(m().admin, { code: "P012", name: "X", projectType: "nonsense", isActive: true })).rejects.toThrow(/project type/);
    await expect(saveClient(m().sean, { name: "Nope", isActive: true })).rejects.toThrow(/Administrator/);
  });

  it("workers get name parts, contact, engagement type and an automatic worker ID", async () => {
    const a = await createUser(m().admin, {
      username: "liam",
      pin: "482913",
      person: { firstName: "Liam", middleName: "J", lastName: "Byrne", email: "Liam@Example.ie", mobile: "+353 87 123 4567", address: "Shankill", engagementType: "sub_contractor" },
      isWorker: true,
      isManager: false,
      isAdmin: false,
      isIt: false,
    });
    expect(a.workerCode).toBe("W004"); // seed has W001–W003
    expect(a.engagementType).toBe("sub_contractor");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId));
    expect(u).toMatchObject({ displayName: "Liam J Byrne", firstName: "Liam", email: "liam@example.ie", mobile: "+353 87 123 4567" });

    const b = await addCrewWorker(m().sean, { person: { firstName: "Ann", lastName: "Ryan" }, projectIds: [], jobRoleIds: [s.roles.DUMP.id] });
    expect(b.workerCode).toBe("W005");

    await updateUser(m().admin, a.id, { workerCode: "W004", person: { firstName: "Liam", lastName: "Byrne", engagementType: "paye" }, isWorker: true, isManager: false, isAdmin: false, isIt: false });
    const [u2] = await db.select().from(schema.users).where(eq(schema.users.id, a.userId));
    expect(u2.displayName).toBe("Liam Byrne");
    await expect(addCrewWorker(m().sean, { person: { firstName: "No", lastName: "Mail", email: "not-an-email" }, projectIds: [], jobRoleIds: [s.roles.DUMP.id] })).rejects.toThrow(/email/);
    await expect(addCrewWorker(m().sean, { person: { firstName: "", lastName: "X" }, projectIds: [], jobRoleIds: [s.roles.DUMP.id] })).rejects.toThrow(/First name/);
  });

  it("unpaid break minutes are deducted and the work comment is kept, also in the CSV", async () => {
    const day = s.lastWeek;
    await enterCrewHours(m().sean, {
      date: day,
      projectId: s.projects.P001.id,
      rows: [{ workerId: m().pat.memberId, jobRoleId: s.roles.DUMP.id, start: "07:00", end: "15:30", breakMinutes: 30, note: "Kerb laying" }],
    });
    const [e] = await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, m().pat.memberId));
    expect(e.durationSeconds).toBe(8 * 3600);
    expect(e.breakMinutes).toBe(30);
    expect(e.note).toBe("Kerb laying");
    expect(e.value).toBe("224.00"); // 8 h × €28

    await expect(
      correctEntry(m().sean, e.id, { projectId: e.projectId, jobRoleId: e.jobRoleId, startAt: e.startAt, endAt: e.endAt, breakMinutes: 600 }, "typo"),
    ).rejects.toThrow(/shorter than the shift/);
    const fixed = await correctEntry(m().sean, e.id, { projectId: e.projectId, jobRoleId: e.jobRoleId, startAt: e.startAt, endAt: e.endAt, breakMinutes: 60 }, "Long lunch");
    expect(fixed!.durationSeconds).toBe(7.5 * 3600);
    expect(fixed!.note).toBe("Kerb laying"); // unchanged when not sent

    const ts = await timesheetFor(m().pat.memberId, s.lastWeek);
    const v = await submitOnBehalf(m().sean, ts.id, "Hours recorded by supervisor");
    expect((await approveTimesheet(m().sean, ts.id, v)).approved).toBe(true);
    const csv = (await buildExport(m().admin, { scope: "team", fromWeek: s.lastWeek, toWeek: s.lastWeek })).csv;
    expect(csv).toContain("Unpaid break minutes");
    expect(csv).toContain(",60,7.50,27000,28.00,Hourly,EUR,210.00,");
    expect(csv).toContain("Kerb laying");
  });

  it("a day rate pays the agreed amount per day; two day-rate entries on one day block approval", async () => {
    await addRate(m().admin, { jobRoleId: s.roles.DIG.id, workerId: m().mary.memberId, hourlyRate: "220.00", unit: "day", effectiveFrom: "2026-01-01" });
    const day = s.lastWeek;
    const e1 = await addEntry(
      m().sean,
      m().mary.memberId,
      { projectId: s.projects.P001.id, jobRoleId: s.roles.DIG.id, startAt: dublin(day, 7), endAt: dublin(day, 12), note: "Morning" },
      "Paper sheet",
    );
    expect(e1!.rateUnit).toBe("day");
    expect(e1!.value).toBe("220.00");

    await addEntry(m().sean, m().mary.memberId, { projectId: s.projects.P002.id, jobRoleId: s.roles.DIG.id, startAt: dublin(day, 13), endAt: dublin(day, 16) }, "Paper sheet");
    const ts = await timesheetFor(m().mary.memberId, s.lastWeek);
    const v = await submitOnBehalf(m().sean, ts.id, "Hours recorded by supervisor");
    await expect(approveTimesheet(m().sean, ts.id, v)).rejects.toThrow(/same day/);
  });
});
