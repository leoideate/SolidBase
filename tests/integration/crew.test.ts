import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/server/db";
import { addWeekToDate } from "@/lib/time";
import { addCrewWorker, enterCrewHours, listCrew, setCrewAllocations } from "@/server/services/crew";
import { approveTimesheet, submitOnBehalf } from "@/server/services/timesheets";
import { resetPin } from "@/server/services/admin";
import { authenticate } from "@/server/services/auth";
import { seedDemo, timesheetFor } from "../fixtures";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const m = () => s.members;

beforeEach(async () => {
  s = await seedDemo();
});

async function addJoe() {
  return addCrewWorker(m().sean, { person: { firstName: "Joe", lastName: "Nolan", engagementType: "paye" }, workerCode: "W010", projectIds: [s.projects.P001.id], jobRoleIds: [s.roles.DUMP.id] });
}

describe("supervisor crew", () => {
  it("supervisor adds a worker with roles; the worker has no login until admin sets a PIN", async () => {
    const joe = await addJoe();
    const crew = await listCrew(m().sean);
    const row = crew.find((w) => w.id === joe.id)!;
    expect(row.hasPin).toBe(false);
    expect(row.roleIds).toEqual([s.roles.DUMP.id]);
    expect(row.projectIds).toEqual([s.projects.P001.id]);
    // Other supervisors don't see or manage Joe.
    expect((await listCrew(m().niamh)).some((w) => w.id === joe.id)).toBe(false);
    await expect(setCrewAllocations(m().niamh, joe.id, [], [s.roles.DIG.id])).rejects.toThrow();

    await expect(authenticate(row.username, "246810")).rejects.toThrow(/incorrect/);
    await resetPin(m().admin, joe.id, "246810");
    expect((await authenticate(row.username, "246810")).member.id).toBe(joe.id);
  });

  it("workers can't add workers, and worker IDs stay unique", async () => {
    await expect(addCrewWorker(m().pat, { person: { firstName: "X", lastName: "Y" }, workerCode: "W011", projectIds: [], jobRoleIds: [s.roles.DUMP.id] })).rejects.toThrow(/Supervisor/);
    await addJoe();
    await expect(addJoe()).rejects.toThrow(/already in use/);
  });

  it("supervisor enters crew hours, submits on behalf and approves", async () => {
    const joe = await addJoe();
    const week = addWeekToDate(s.lastWeek, 0);
    const n = await enterCrewHours(m().sean, {
      date: week,
      projectId: s.projects.P001.id,
      rows: [
        { workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "07:00", end: "15:30" },
        { workerId: m().pat.memberId, jobRoleId: s.roles.DIG.id, start: "22:00", end: "06:00" },
      ],
    });
    expect(n).toBe(2);
    const entries = await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, joe.id));
    expect(entries).toHaveLength(1);
    expect(entries[0].durationSeconds).toBe(8.5 * 3600);
    expect(entries[0].source).toBe("manager");
    const night = await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, m().pat.memberId));
    expect(night[0].durationSeconds).toBe(8 * 3600); // ended the next morning

    // Overlapping second entry is refused, and nothing from that batch is saved.
    await expect(
      enterCrewHours(m().sean, {
        date: week,
        projectId: s.projects.P001.id,
        rows: [
          { workerId: m().mary.memberId, jobRoleId: s.roles.DUMP.id, start: "07:00", end: "08:00" },
          { workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "08:00", end: "09:00" },
        ],
      }),
    ).rejects.toThrow(/overlaps/);
    expect(await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, m().mary.memberId))).toHaveLength(0);

    // Not someone else's crew.
    await expect(
      enterCrewHours(m().niamh, { date: week, projectId: s.projects.P001.id, rows: [{ workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "10:00", end: "11:00" }] }),
    ).rejects.toThrow();

    const ts = await timesheetFor(joe.id, s.lastWeek);
    await expect(submitOnBehalf(m().niamh, ts.id, "x")).rejects.toThrow();
    const v = await submitOnBehalf(m().sean, ts.id, "Hours recorded by supervisor");
    const r = await approveTimesheet(m().sean, ts.id, v);
    expect(r.approved).toBe(true);
  });
});

describe("typed roles", () => {
  it("supervisor types a role that isn't in the list; it is created once and reused", async () => {
    const joe = await addCrewWorker(m().sean, { person: { firstName: "Joe", lastName: "Nolan" }, workerCode: "W020", projectIds: [], jobRoleIds: [], typedRoles: ["Steel Fixer"] });
    await setCrewAllocations(m().sean, joe.id, [], [s.roles.DUMP.id], ["steel  fixer", "Pipe Layer"]);
    const roles = await db.select().from(schema.jobRoles).where(eq(schema.jobRoles.companyId, s.company.id));
    expect(roles.filter((r) => r.name.toLowerCase() === "steel fixer")).toHaveLength(1);
    const row = (await listCrew(m().sean)).find((w) => w.id === joe.id)!;
    expect(row.roleIds).toHaveLength(3);
    await expect(setCrewAllocations(m().pat, joe.id, [], [], ["X"])).rejects.toThrow();
  });
});

describe("standard roles", () => {
  it("admin loads the construction roles once; re-running adds nothing", async () => {
    const { loadStandardRoles } = await import("@/server/services/admin");
    const { STANDARD_ROLES } = await import("@/server/role-catalogue");
    expect(await loadStandardRoles(m().admin)).toBe(STANDARD_ROLES.length);
    expect(await loadStandardRoles(m().admin)).toBe(0);
    await expect(loadStandardRoles(m().sean)).rejects.toThrow();
  });
});

describe("bulk assignment", () => {
  it("admin assigns several workers to a manager at once", async () => {
    const { assignWorkers } = await import("@/server/services/admin");
    expect(await assignWorkers(m().admin, m().niamh.memberId, [m().pat.memberId, m().mary.memberId], "primary")).toBe(2);
    await expect(assignWorkers(m().admin, m().niamh.memberId, [], "primary")).rejects.toThrow(/Tick/);
    await expect(assignWorkers(m().sean, m().niamh.memberId, [m().pat.memberId], "primary")).rejects.toThrow();
  });
});

describe("rate entered with crew hours", () => {
  it("supervisor sets a worker's rate while entering hours; the entry is priced with it", async () => {
    const joe = await addJoe();
    const date = addWeekToDate(s.lastWeek, 0);
    await enterCrewHours(m().sean, { date, projectId: s.projects.P001.id, rows: [{ workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "07:00", end: "15:00", rate: "40.00" }] });
    const [e] = await db.select().from(schema.workEntries).where(eq(schema.workEntries.workerId, joe.id));
    expect(Number(e.appliedRate)).toBe(40);
    expect(Number(e.value)).toBe(320);
    // A different rate for the same role and day needs admin; so does a worker outside the crew.
    await expect(enterCrewHours(m().sean, { date, projectId: s.projects.P001.id, rows: [{ workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "16:00", end: "17:00", rate: "45" }] })).rejects.toThrow(/Ask admin/);
    await expect(enterCrewHours(m().niamh, { date, projectId: s.projects.P001.id, rows: [{ workerId: joe.id, jobRoleId: s.roles.DUMP.id, start: "16:00", end: "17:00", rate: "45" }] })).rejects.toThrow();
  });
});
