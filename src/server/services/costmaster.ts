import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import type { Actor } from "../actor";
import { costProjectIds, costScope } from "../authz";
import { Forbidden } from "../errors";
import { sumMoney } from "@/lib/money";
import { approvedEntries } from "./views";

export const COST_BASIS = "Approved labour hours × agreed worker hourly rate, before deductions. Not a payroll, payment or fully loaded cost.";

/**
 * CostMaster release-1 view (C01, C02): approved hours and labour value by project, week and role,
 * for explicitly authorised projects only. Read access cannot approve or edit rates (C04).
 */
export async function costReport(actor: Actor, f: { fromWeek: string; toWeek: string; projectId?: string }) {
  const scope = await costScope(db, actor);
  if (!scope) throw new Forbidden("CostMaster access has not been granted to your account.");
  let projectIds = await costProjectIds(db, actor, scope);
  const projects = projectIds.length
    ? await db.select().from(schema.projects).where(inArray(schema.projects.id, projectIds)).orderBy(asc(schema.projects.code))
    : [];
  if (f.projectId) projectIds = projectIds.filter((p) => p === f.projectId);
  const rows = await approvedEntries({ companyId: actor.companyId, projectIds, fromWeek: f.fromWeek, toWeek: f.toWeek });

  type Line = { projectId: string; projectCode: string; projectName: string; weekStart: string; roleName: string; seconds: number; values: string[] };
  const lines = new Map<string, Line>();
  for (const r of rows) {
    const k = `${r.projectId}|${r.weekStart}|${r.roleCode}`;
    const l = lines.get(k) ?? { projectId: r.projectId, projectCode: r.projectCode, projectName: r.projectName, weekStart: r.weekStart, roleName: r.roleName, seconds: 0, values: [] };
    l.seconds += r.durationSeconds ?? 0;
    l.values.push(r.value ?? "0");
    lines.set(k, l);
  }
  const byLine = [...lines.values()]
    .map(({ values, ...l }) => ({ ...l, value: sumMoney(values) }))
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || b.weekStart.localeCompare(a.weekStart) || a.roleName.localeCompare(b.roleName));

  const byProject = projects
    .filter((p) => projectIds.includes(p.id))
    .map((p) => {
      const mine = rows.filter((r) => r.projectId === p.id);
      return { ...p, seconds: mine.reduce((s, r) => s + (r.durationSeconds ?? 0), 0), value: sumMoney(mine.map((r) => r.value)) };
    });

  return { projects, byProject, byLine, entries: rows, canExport: scope.canExport, allProjects: scope.allProjects };
}

export async function hasCostAccess(actor: Actor) {
  return (await costScope(db, actor)) !== null;
}

export async function companyName(companyId: string) {
  const [c] = await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId));
  return c?.name ?? "";
}
