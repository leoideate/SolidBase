import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Tx } from "../db";
import type { Actor } from "../actor";
import { requireAdmin } from "../authz";
import { AppError, pgCode } from "../errors";
import { parseLocalDateTime } from "@/lib/time";
import { audit } from "./audit";
import { writeAllocations } from "./admin";
import { writeBank, checkBank } from "./bank";
import { insertManagerEntry, mapDbError } from "./corrections";
import { usernameFor } from "./crew";
import { nextWorkerCode, personValues } from "./people";

/**
 * Admin bulk import of workers and past working hours from CSV (templates in public/templates/).
 *
 * Every upload runs in one transaction, each row in its own savepoint, using the same services as
 * the screens (so the same validation, pricing, revisions and audit). A preview runs the whole
 * import and then rolls it back, so it reports exactly what the real import would do, including
 * overlaps and approved weeks. The real import saves nothing unless every row is valid.
 */

export type ImportKind = "workers" | "hours";
export type ImportRow = { line: number; label: string; status: "ok" | "skip" | "error"; message?: string };
export type ImportReport = { kind: ImportKind; committed: boolean; ok: number; skipped: number; errors: number; rows: ImportRow[] };

export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_REASON = "Imported from CSV";

class Rollback extends Error {}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/** RFC 4180 CSV (quotes, doubled quotes, CRLF, BOM). Semicolon files from Excel are detected from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new AppError("The file has an unclosed quote. Check it was saved as CSV.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header names people are likely to use for each column. */
const ALIASES: Record<string, string> = {
  worker_code: "worker_id",
  id: "worker_id",
  first: "first_name",
  middle: "middle_name",
  last: "last_name",
  surname: "last_name",
  phone: "mobile",
  mobile_number: "mobile",
  email_address: "email",
  engagement: "engagement_type",
  roles: "job_roles",
  job_role_codes: "job_roles",
  project: "project_id",
  project_code: "project_id",
  project_ids: "projects",
  role: "job_role",
  role_code: "job_role",
  supervisor: "supervisor_username",
  supervisor_id: "supervisor_username",
  bank: "bank_name",
  start_time: "start",
  end_time: "end",
  finish: "end",
  break: "break_minutes",
  break_mins: "break_minutes",
  work_done_comment: "work_done",
  note: "work_done",
  notes: "work_done",
  comment: "work_done",
};

const headerKey = (h: string) => {
  const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ALIASES[k] ?? k;
};

type Record_ = { line: number; get: (k: string) => string };

function records(text: string, required: string[]): Record_[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new AppError("The file is empty.");
  const header = rows[0].map(headerKey);
  const missing = required.filter((r) => !header.includes(r));
  if (missing.length) throw new AppError(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Use the template headers.`);
  const out: Record_[] = [];
  rows.slice(1).forEach((cells, i) => {
    if (cells.every((c) => !c.trim())) return; // blank lines
    const map = new Map(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
    out.push({ line: i + 2, get: (k) => map.get(k) ?? "" });
  });
  if (out.length === 0) throw new AppError("The file has a header but no rows.");
  if (out.length > MAX_IMPORT_ROWS) throw new AppError(`Up to ${MAX_IMPORT_ROWS} rows per file. Split the file and upload each part.`);
  return out;
}

const list = (v: string) => v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);

/** YYYY-MM-DD, or DD/MM/YYYY as Excel writes Irish dates. */
export function parseDate(v: string): string | null {
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** H:MM or HH:MM (seconds, as Excel sometimes adds, are ignored). */
export function parseTime(v: string): string | null {
  const t = v.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return `${t[1].padStart(2, "0")}:${t[2]}`;
}

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Running an import
// ---------------------------------------------------------------------------

async function run(
  actor: Actor,
  kind: ImportKind,
  items: Record_[],
  commit: boolean,
  handle: (tx: Tx, r: Record_, ctx: Lookups) => Promise<{ label: string; skip?: string }>,
): Promise<ImportReport> {
  requireAdmin(actor);
  const rows: ImportRow[] = [];
  try {
    await db.transaction(async (tx) => {
      const ctx = await lookups(tx, actor);
      for (const r of items) {
        const fallback = r.get("worker_id") || `row ${r.line}`;
        try {
          const res = await tx.transaction((sp) => handle(sp, r, ctx));
          rows.push({ line: r.line, label: res.label, status: res.skip ? "skip" : "ok", message: res.skip });
        } catch (e) {
          rows.push({ line: r.line, label: fallback, status: "error", message: rowError(e) });
        }
      }
      if (!commit || rows.some((x) => x.status === "error")) throw new Rollback();
      await audit(tx, actor, `import.${kind}`, "company", actor.companyId, { rows: items.length, imported: rows.filter((x) => x.status === "ok").length });
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  const errors = rows.filter((x) => x.status === "error").length;
  return {
    kind,
    committed: commit && errors === 0,
    ok: rows.filter((x) => x.status === "ok").length,
    skipped: rows.filter((x) => x.status === "skip").length,
    errors,
    rows,
  };
}

function rowError(e: unknown): string {
  try {
    mapDbError(e);
  } catch (mapped) {
    if (mapped instanceof AppError) return mapped.message;
  }
  if (pgCode(e) === "23505") return "That worker ID or login name is already in use.";
  return "Couldn't import this row.";
}

type Lookups = {
  projects: Map<string, string>;
  roles: Map<string, string>;
  workers: Map<string, string>;
  supervisors: Map<string, string>;
};

async function lookups(tx: Tx, actor: Actor): Promise<Lookups> {
  const c = actor.companyId;
  const projects = await tx.select({ id: schema.projects.id, code: schema.projects.code }).from(schema.projects).where(eq(schema.projects.companyId, c));
  const roles = await tx.select({ id: schema.jobRoles.id, code: schema.jobRoles.code }).from(schema.jobRoles).where(eq(schema.jobRoles.companyId, c));
  const members = await tx
    .select({ id: schema.companyMembers.id, code: schema.companyMembers.workerCode, username: schema.users.username, isManager: schema.companyMembers.isManager })
    .from(schema.companyMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.companyMembers.userId))
    .where(eq(schema.companyMembers.companyId, c));
  const up = (s: string) => s.trim().toUpperCase();
  const supervisors = new Map<string, string>();
  for (const m of members.filter((x) => x.isManager)) {
    supervisors.set(up(m.username), m.id);
    supervisors.set(up(m.code), m.id);
  }
  return {
    projects: new Map(projects.map((p) => [up(p.code), p.id])),
    roles: new Map(roles.map((r) => [up(r.code), r.id])),
    workers: new Map(members.map((m) => [up(m.code), m.id])),
    supervisors,
  };
}

function codes(map: Map<string, string>, values: string[], what: string) {
  return values.map((v) => {
    const id = map.get(v.toUpperCase());
    if (!id) throw new AppError(`Unknown ${what} "${v}". Add it in Admin first or fix the code.`);
    return id;
  });
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

/** "Sub-Contractor" → sub_contractor; "Employee" is the client's word for PAYE. */
function engagementOf(v: string) {
  const k = v.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  return k === "employee" ? "paye" : k;
}

export const WORKER_COLUMNS = ["worker_id", "first_name", "middle_name", "last_name", "mobile", "email", "address", "engagement_type", "job_roles", "projects", "supervisor_username", "bank_name", "iban"];

/**
 * Workers are added like a supervisor adds crew: no PIN (admin gives app access later), login name
 * from the worker ID. A worker ID that already exists is skipped, so a file can be uploaded again.
 * Roles and projects are optional here; admin or the supervisor can allocate them later.
 */
export async function importWorkers(actor: Actor, csv: string, commit: boolean) {
  requireAdmin(actor);
  const items = records(csv, ["first_name", "last_name"]);
  const seen = new Set<string>();
  return run(actor, "workers", items, commit, async (tx, r, ctx) => {
    const given = r.get("worker_id").toUpperCase();
    if (given) {
      if (seen.has(given)) throw new AppError(`Worker ID ${given} appears more than once in the file.`);
      seen.add(given);
      if (ctx.workers.has(given)) return { label: given, skip: "Already exists, skipped." };
    }
    const engagement = engagementOf(r.get("engagement_type"));
    if (/\de\+\d/i.test(r.get("mobile"))) {
      throw new AppError("Excel has turned the mobile number into a number like 3.53E+11 and dropped digits. Format the column as Text and re-enter it.");
    }
    const person = personValues({
      firstName: r.get("first_name"),
      middleName: r.get("middle_name"),
      lastName: r.get("last_name"),
      email: r.get("email"),
      mobile: r.get("mobile"),
      address: r.get("address"),
      engagementType: engagement,
    });
    const roleIds = codes(ctx.roles, list(r.get("job_roles")), "role");
    const projectIds = codes(ctx.projects, list(r.get("projects")), "project");
    const sup = r.get("supervisor_username");
    const supervisorId = sup ? ctx.supervisors.get(sup.toUpperCase()) : undefined;
    if (sup && !supervisorId) throw new AppError(`"${sup}" is not a supervisor. Give the supervisor's username or worker ID.`);
    const bankName = r.get("bank_name");
    const iban = r.get("iban");
    const bank = bankName || iban ? checkBank({ bankName, iban }) : null;

    const workerCode = given || (await nextWorkerCode(tx, actor.companyId));
    const [user] = await tx
      .insert(schema.users)
      .values({ username: usernameFor(workerCode), ...person.user, pinHash: null, mustChangePin: true })
      .returning();
    const [member] = await tx
      .insert(schema.companyMembers)
      .values({ companyId: actor.companyId, userId: user.id, workerCode, engagementType: person.engagementType, isWorker: true })
      .returning();
    if (supervisorId) {
      await tx
        .insert(schema.managerAssignments)
        .values({ companyId: actor.companyId, managerId: supervisorId, workerId: member.id, kind: "primary", createdBy: actor.memberId });
    }
    await writeAllocations(tx, actor, member.id, projectIds, roleIds);
    if (bank) await writeBank(tx, actor, member, bank);
    await audit(tx, actor, "worker.imported", "member", member.id, { workerCode });
    ctx.workers.set(workerCode.toUpperCase(), member.id);
    return { label: `${workerCode} ${person.user.displayName}` };
  });
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

export const HOURS_COLUMNS = ["worker_id", "date", "project_id", "job_role", "start", "end", "break_minutes", "work_done"];

/**
 * Past hours, one row per shift, recorded as supervisor/admin entries (priced from the rates in
 * force on the day). Weeks stay open for the normal submit and approve flow; approved weeks are
 * refused. Times are Dublin wall-clock; an end at or before the start means the next day.
 */
export async function importHours(actor: Actor, csv: string, commit: boolean) {
  requireAdmin(actor);
  const items = records(csv, ["worker_id", "date", "project_id", "job_role", "start", "end"]);
  return run(actor, "hours", items, commit, async (tx, r, ctx) => {
    const code = r.get("worker_id").toUpperCase();
    const date = parseDate(r.get("date"));
    const label = `${code || "?"} ${date ?? r.get("date")}`;
    const workerId = ctx.workers.get(code);
    if (!workerId) throw new AppError(code ? `Unknown worker ID ${code}. Import the workers file first.` : "worker_id is empty.");
    if (!date) throw new AppError(`"${r.get("date")}" isn't a date. Use YYYY-MM-DD or DD/MM/YYYY.`);
    const [projectId] = codes(ctx.projects, [r.get("project_id")], "project");
    const [jobRoleId] = codes(ctx.roles, [r.get("job_role")], "role");
    const start = parseTime(r.get("start"));
    const end = parseTime(r.get("end"));
    if (!start || !end) throw new AppError("Enter start and end as HH:MM (24-hour).");
    const breakText = r.get("break_minutes");
    const breakMinutes = breakText ? Number(breakText) : 0;
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0) throw new AppError("break_minutes must be a whole number, 0 or more.");
    const startAt = parseLocalDateTime(`${date}T${start}`)!;
    let endAt = parseLocalDateTime(`${date}T${end}`)!;
    if (endAt <= startAt) endAt = parseLocalDateTime(`${nextDay(date)}T${end}`)!;
    await insertManagerEntry(tx, actor, workerId, { projectId, jobRoleId, startAt, endAt, breakMinutes, note: r.get("work_done") || null }, IMPORT_REASON);
    return { label };
  });
}

