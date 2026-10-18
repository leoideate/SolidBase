import { describe, expect, it } from "vitest";
import { elapsedSeconds, isoWithOffset, localDate, splitAtWeekBoundaries, weekStartInstant, weekStartOf } from "@/lib/time";
import { entryValue, hours, sumMoney } from "@/lib/money";
import { pickRate, specificity } from "@/server/services/rates";
import { csvCell } from "@/server/services/exports";
import { dublin } from "../fixtures";

describe("time (Europe/Dublin)", () => {
  it("computes duration across midnight", () => {
    expect(elapsedSeconds(dublin("2026-10-14", 22), dublin("2026-10-15", 6))).toBe(8 * 3600);
  });

  it("spring forward: 29 Mar 2026 00:00→06:00 local is 5 real hours", () => {
    expect(elapsedSeconds(dublin("2026-03-29", 0), dublin("2026-03-29", 6))).toBe(5 * 3600);
  });

  it("fall back: 25 Oct 2026 00:00→06:00 local is 7 real hours", () => {
    expect(elapsedSeconds(dublin("2026-10-25", 0), dublin("2026-10-25", 6))).toBe(7 * 3600);
  });

  it("finds the Monday week start in Dublin time, not UTC", () => {
    // Sunday 23:30 Dublin in summer (22:30 UTC) is still the previous week.
    expect(weekStartOf(dublin("2026-10-18", 23, 30))).toBe("2026-10-12");
    // Monday 00:30 Dublin in summer is Sunday 23:30 UTC but already the new week.
    expect(weekStartOf(dublin("2026-10-19", 0, 30))).toBe("2026-10-19");
    expect(weekStartInstant("2026-10-19").toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(weekStartInstant("2026-10-26").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("splits a Sunday night shift at Monday 00:00 without losing time", () => {
    const start = dublin("2026-10-18", 20);
    const end = dublin("2026-10-19", 4);
    const pieces = splitAtWeekBoundaries(start, end);
    expect(pieces.map((p) => p.weekStart)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(pieces.map((p) => elapsedSeconds(p.start, p.end))).toEqual([4 * 3600, 4 * 3600]);
    expect(pieces[0].end.getTime()).toBe(pieces[1].start.getTime());
  });

  it("does not split a shift inside one week, including the DST weekend", () => {
    expect(splitAtWeekBoundaries(dublin("2026-10-24", 20), dublin("2026-10-25", 6))).toHaveLength(1);
  });

  it("formats offset-bearing timestamps and local dates", () => {
    expect(isoWithOffset(dublin("2026-07-01", 7, 30))).toBe("2026-07-01T07:30:00+01:00");
    expect(isoWithOffset(dublin("2026-12-01", 7, 30))).toBe("2026-12-01T07:30:00Z");
    expect(localDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });
});

describe("money and rounding", () => {
  it("reproduces the ARD p.6 example: 40h and €1,135.00", () => {
    const values = [entryValue(20 * 3600, "28.00"), entryValue(15 * 3600, "30.00"), entryValue(5 * 3600, "25.00")];
    expect(values).toEqual(["560.00", "450.00", "125.00"]);
    expect(sumMoney(values)).toBe("1135.00");
    expect(hours(40 * 3600)).toBe("40.00");
  });

  it("rounds each entry half-up to the cent", () => {
    // 1 second at €30/h = 0.008333 → 0.01
    expect(entryValue(1, "30")).toBe("0.01");
    // 7h 20m at €28.50 = 209.00
    expect(entryValue(7 * 3600 + 20 * 60, "28.50")).toBe("209.00");
    // 61 s at €25 = 0.42361 → 0.42
    expect(entryValue(61, "25")).toBe("0.42");
  });
});

describe("rate resolution", () => {
  const base = { id: "", companyId: "c", jobRoleId: "r", currency: "EUR", effectiveTo: null, createdBy: null, createdAt: new Date() };
  const rate = (id: string, o: { workerId?: string; projectId?: string; from?: string; amount?: string }) => ({
    ...base,
    id,
    workerId: o.workerId ?? null,
    projectId: o.projectId ?? null,
    hourlyRate: o.amount ?? "25.00",
    unit: "hour" as const,
    effectiveFrom: o.from ?? "2026-01-01",
  });

  it("orders specificity worker+project > worker > project > role", () => {
    expect(specificity({ workerId: "w", projectId: "p" })).toBe(4);
    expect(specificity({ workerId: "w", projectId: null })).toBe(3);
    expect(specificity({ workerId: null, projectId: "p" })).toBe(2);
    expect(specificity({ workerId: null, projectId: null })).toBe(1);
    const r = pickRate([rate("role", {}), rate("proj", { projectId: "p" }), rate("wkr", { workerId: "w" }), rate("both", { workerId: "w", projectId: "p" })]);
    expect(r.status === "ok" && r.rate.id).toBe("both");
    const r2 = pickRate([rate("role", {}), rate("proj", { projectId: "p" }), rate("wkr", { workerId: "w" })]);
    expect(r2.status === "ok" && r2.rate.id).toBe("wkr");
  });

  it("latest effective date supersedes within a level", () => {
    const r = pickRate([rate("old", { from: "2026-01-01" }), rate("new", { from: "2026-06-01" })]);
    expect(r.status === "ok" && r.rate.id).toBe("new");
  });

  it("flags a conflict for two rates at the same level and date, and missing when none", () => {
    expect(pickRate([rate("a", { projectId: "p" }), rate("b", { projectId: "p", amount: "26" })]).status).toBe("conflict");
    expect(pickRate([]).status).toBe("missing");
  });
});

describe("csv", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell('O"Brien, Tom')).toBe('"O""Brien, Tom"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12.50")).toBe("-12.50");
  });
});
