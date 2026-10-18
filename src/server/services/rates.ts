import { and, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { schema } from "../db";
import { rateValue } from "@/lib/money";
import { localDate } from "@/lib/time";
import type { RateStatus, RateUnit } from "../db/schema";

type Rate = typeof schema.rates.$inferSelect;

export type RateResolution =
  | { status: "ok"; rate: Rate }
  | { status: "missing" }
  | { status: "conflict"; candidates: Rate[] };

/** worker+project (4) > worker (3) > project (2) > role (1). */
export function specificity(r: Pick<Rate, "workerId" | "projectId">): number {
  if (r.workerId && r.projectId) return 4;
  if (r.workerId) return 3;
  if (r.projectId) return 2;
  return 1;
}

export const SPECIFICITY_LABEL: Record<number, string> = {
  4: "Worker + project",
  3: "Worker",
  2: "Project",
  1: "Role standard",
};

/**
 * Pure resolution over candidate rates already filtered to those effective on the date and
 * applicable to the worker/project/role. Most specific level wins; within a level the latest
 * effective_from wins (effective-dated supersession). Two candidates at the same level and the
 * same effective_from are a conflict that admin must resolve before approval (ARD p.3).
 */
export function pickRate(candidates: Rate[]): RateResolution {
  if (candidates.length === 0) return { status: "missing" };
  const top = Math.max(...candidates.map(specificity));
  const level = candidates.filter((c) => specificity(c) === top);
  const latest = level.reduce((a, c) => (c.effectiveFrom > a ? c.effectiveFrom : a), level[0].effectiveFrom);
  const winners = level.filter((c) => c.effectiveFrom === latest);
  if (winners.length > 1) return { status: "conflict", candidates: winners };
  return { status: "ok", rate: winners[0] };
}

export async function resolveRate(
  tx: DbOrTx,
  p: { companyId: string; workerId: string; projectId: string; jobRoleId: string; onDate: string },
): Promise<RateResolution> {
  const candidates = await tx
    .select()
    .from(schema.rates)
    .where(
      and(
        eq(schema.rates.companyId, p.companyId),
        eq(schema.rates.jobRoleId, p.jobRoleId),
        lte(schema.rates.effectiveFrom, p.onDate),
        or(isNull(schema.rates.effectiveTo), gte(schema.rates.effectiveTo, p.onDate)),
        or(isNull(schema.rates.workerId), eq(schema.rates.workerId, p.workerId)),
        or(isNull(schema.rates.projectId), eq(schema.rates.projectId, p.projectId)),
      ),
    );
  return pickRate(candidates);
}

/** Pricing fields for a closed entry. A missing/conflicting rate leaves value null and flags it. */
export async function priceEntry(
  tx: DbOrTx,
  e: { companyId: string; workerId: string; projectId: string; jobRoleId: string; startAt: Date; durationSeconds: number },
): Promise<{ rateId: string | null; appliedRate: string | null; rateUnit: RateUnit; value: string | null; rateStatus: RateStatus; currency: string }> {
  const r = await resolveRate(tx, { ...e, onDate: localDate(e.startAt) });
  if (r.status !== "ok") return { rateId: null, appliedRate: null, rateUnit: "hour", value: null, rateStatus: r.status, currency: "EUR" };
  return {
    rateId: r.rate.id,
    appliedRate: r.rate.hourlyRate,
    rateUnit: r.rate.unit,
    value: rateValue(r.rate.unit, e.durationSeconds, r.rate.hourlyRate),
    rateStatus: "ok",
    currency: r.rate.currency,
  };
}

/**
 * Re-price closed entries in timesheets that are not approved, after admin rate changes. Approved
 * history is never rewritten (ARD p.6). Returns the IDs of affected timesheets.
 */
export async function repriceUnapproved(tx: DbOrTx, companyId: string): Promise<string[]> {
  const rows = await tx
    .select({ e: schema.workEntries })
    .from(schema.workEntries)
    .innerJoin(schema.timesheets, eq(schema.timesheets.id, schema.workEntries.timesheetId))
    .where(
      and(
        eq(schema.workEntries.companyId, companyId),
        eq(schema.workEntries.status, "closed"),
        ne(schema.timesheets.status, "approved"),
      ),
    );
  const changed = new Set<string>();
  for (const { e } of rows) {
    const p = await priceEntry(tx, { ...e, durationSeconds: e.durationSeconds ?? 0 });
    if (p.rateId !== e.rateId || p.value !== e.value || p.rateStatus !== e.rateStatus) {
      await tx.update(schema.workEntries).set({ ...p, updatedAt: new Date() }).where(eq(schema.workEntries.id, e.id));
      changed.add(e.timesheetId);
    }
  }
  return [...changed];
}
