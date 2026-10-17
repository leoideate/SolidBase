import { db, schema } from "../db";
import type { Actor } from "../actor";
import { canExportTeam, costProjectIds, costScope, managedWorkerIds } from "../authz";
import { AppError, Forbidden } from "../errors";
import { hours, sumMoney } from "@/lib/money";
import { isoWithOffset, isWeekStart, localDate } from "@/lib/time";
import { audit } from "./audit";
import { approvedEntries } from "./views";

export type ExportFilters = { scope: "team" | "costmaster"; fromWeek: string; toWeek: string; workerId?: string; projectId?: string };

export const CSV_COLUMNS = [
  "Entry ID",
  "Timesheet ID",
  "Approved version",
  "Worker ID",
  "Worker name",
  "Project code",
  "Project name",
  "Site reference",
  "Role code",
  "Role name",
  "Work date",
  "Clock in",
  "Clock out",
  "Decimal hours",
  "Duration seconds",
  "Applied hourly rate",
  "Currency",
  "Timesheet value",
  "Approval status",
  "Approved by",
  "Approval timestamp",
];

/** RFC 4180 quoting plus spreadsheet formula-injection protection. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Approved-entry CSV (ARD p.6). One row per approved work entry; pending or reopened entries are
 * excluded because only approved timesheets are read. The actor's permission scope is applied
 * to every row (T03), and each export is recorded with the entry IDs and approved versions.
 */
export async function buildExport(actor: Actor, f: ExportFilters) {
  if (!isWeekStart(f.fromWeek) || !isWeekStart(f.toWeek) || f.toWeek < f.fromWeek) throw new AppError("Choose a valid week range.");
  let workerIds: string[] | undefined;
  let projectIds: string[] | undefined;
  if (f.scope === "team") {
    if (!(await canExportTeam(db, actor))) throw new Forbidden("Export is not enabled for your account.");
    workerIds = await managedWorkerIds(db, actor);
    if (f.workerId) workerIds = workerIds.filter((w) => w === f.workerId);
    if (f.projectId) projectIds = [f.projectId];
  } else {
    const scope = await costScope(db, actor);
    if (!scope?.canExport) throw new Forbidden("CostMaster export is not enabled for your account.");
    projectIds = await costProjectIds(db, actor, scope);
    if (f.projectId) projectIds = projectIds.filter((p) => p === f.projectId);
    if (f.workerId) workerIds = [f.workerId];
  }
  const rows = await approvedEntries({ companyId: actor.companyId, workerIds, projectIds, fromWeek: f.fromWeek, toWeek: f.toWeek });

  const lines = [CSV_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.entryId,
        r.timesheetId,
        r.approvedVersion,
        r.workerCode,
        r.workerName,
        r.projectCode,
        r.projectName,
        r.siteRef ?? "",
        r.roleCode,
        r.roleName,
        localDate(r.startAt),
        isoWithOffset(r.startAt),
        r.endAt ? isoWithOffset(r.endAt) : "",
        hours(r.durationSeconds ?? 0),
        r.durationSeconds ?? 0,
        r.appliedRate,
        r.currency,
        r.value,
        "Approved",
        r.approvedByName,
        r.approvedAt ? isoWithOffset(r.approvedAt) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const totalSeconds = rows.reduce((s, r) => s + (r.durationSeconds ?? 0), 0);
  const totalValue = sumMoney(rows.map((r) => r.value));

  await db.transaction(async (tx) => {
    const [log] = await tx
      .insert(schema.exportsLog)
      .values({ companyId: actor.companyId, memberId: actor.memberId, scope: actor.isAdmin && f.scope === "team" ? "company" : f.scope, filters: f, rowCount: rows.length, totalSeconds, totalValue })
      .returning();
    if (rows.length) {
      await tx.insert(schema.exportItems).values(rows.map((r) => ({ exportId: log.id, entryId: r.entryId, timesheetId: r.timesheetId, versionNo: r.approvedVersion! })));
    }
    await audit(tx, actor, "export.created", "export", log.id, { ...f, rows: rows.length });
  });

  // UTF-8 BOM so spreadsheet software detects the encoding.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `approved-hours_${f.fromWeek}_to_${f.toWeek}.csv`;
  return { csv, filename, rowCount: rows.length, totalSeconds, totalValue };
}
