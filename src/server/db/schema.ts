import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Company and identity
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Europe/Dublin"),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  createdAt: createdAt(),
});

export const companySettings = pgTable("company_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id),
  longShiftHours: numeric("long_shift_hours", { precision: 5, scale: 2 }).notNull().default("14"),
  weekStartsOn: smallint("week_starts_on").notNull().default(1), // 1 = Monday (ISO)
  managerExportEnabled: boolean("manager_export_enabled").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Module enablement is separate from user permissions (ARD p.10). */
export const moduleEnablements = pgTable(
  "module_enablements",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    module: text("module").notNull(),
    enabled: boolean("enabled").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.module] })],
);

/** Login identity, independent of any company engagement. */
export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(), // stored lower-case
  displayName: text("display_name").notNull(),
  pinHash: text("pin_hash").notNull(),
  mustChangePin: boolean("must_change_pin").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: ts("locked_until"),
  language: text("language").notNull().default("en"),
  createdAt: createdAt(),
});

/** A user's engagement with one company, including access roles. */
export const companyMembers = pgTable(
  "company_members",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    workerCode: text("worker_code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isWorker: boolean("is_worker").notNull().default(true),
    isManager: boolean("is_manager").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    isIt: boolean("is_it").notNull().default(false),
    deactivatedAt: ts("deactivated_at"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.companyId, t.userId), unique().on(t.companyId, t.workerCode)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: uuid("user_id").notNull().references(() => users.id),
    memberId: uuid("member_id").notNull().references(() => companyMembers.id),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

// ---------------------------------------------------------------------------
// Setup: projects, job roles, rates, assignments, permissions
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    siteRef: text("site_ref"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.companyId, t.code)],
);

export const jobRoles = pgTable(
  "job_roles",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.companyId, t.code)],
);

export const workerProjects = pgTable(
  "worker_projects",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workerId: uuid("worker_id").notNull().references(() => companyMembers.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
  },
  (t) => [primaryKey({ columns: [t.workerId, t.projectId] })],
);

export const workerJobRoles = pgTable(
  "worker_job_roles",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workerId: uuid("worker_id").notNull().references(() => companyMembers.id),
    jobRoleId: uuid("job_role_id").notNull().references(() => jobRoles.id),
  },
  (t) => [primaryKey({ columns: [t.workerId, t.jobRoleId] })],
);

/** The only source of a manager's scope (A01). */
export const managerAssignments = pgTable(
  "manager_assignments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    managerId: uuid("manager_id").notNull().references(() => companyMembers.id),
    workerId: uuid("worker_id").notNull().references(() => companyMembers.id),
    kind: text("kind", { enum: ["primary", "cover"] }).notNull().default("primary"),
    createdBy: uuid("created_by").references(() => companyMembers.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.managerId, t.workerId),
    check("manager_not_self", sql`${t.managerId} <> ${t.workerId}`),
  ],
);

/** CostMaster is a separate explicit grant (A01, A02, C01). project_id NULL = all projects in company. */
export const costmasterGrants = pgTable(
  "costmaster_grants",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    memberId: uuid("member_id").notNull().references(() => companyMembers.id),
    projectId: uuid("project_id").references(() => projects.id),
    canExport: boolean("can_export").notNull().default(false),
    canEditCosts: boolean("can_edit_costs").notNull().default(false),
    createdBy: uuid("created_by").references(() => companyMembers.id),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.memberId, t.projectId).nullsNotDistinct()],
);

/** Admin-issued, time-limited, read-only support access for IT (A05). */
export const supportGrants = pgTable("support_grants", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  itMemberId: uuid("it_member_id").notNull().references(() => companyMembers.id),
  reason: text("reason").notNull(),
  grantedBy: uuid("granted_by").notNull().references(() => companyMembers.id),
  grantedAt: ts("granted_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  revokedBy: uuid("revoked_by").references(() => companyMembers.id),
});

/**
 * Agreed hourly worker rates (F04). Specificity: worker+project > worker > project > role.
 * These are worker pay rates, separate from any future client billing rate.
 */
export const rates = pgTable(
  "rates",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    jobRoleId: uuid("job_role_id").notNull().references(() => jobRoles.id),
    workerId: uuid("worker_id").references(() => companyMembers.id),
    projectId: uuid("project_id").references(() => projects.id),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdBy: uuid("created_by").references(() => companyMembers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.companyId, t.jobRoleId),
    check("rate_positive", sql`${t.hourlyRate} >= 0`),
    check("rate_dates", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
);

// ---------------------------------------------------------------------------
// Time recording and timesheets
// ---------------------------------------------------------------------------

export const TIMESHEET_STATUSES = ["draft", "submitted", "returned", "approved"] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const timesheets = pgTable(
  "timesheets",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workerId: uuid("worker_id").notNull().references(() => companyMembers.id),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    status: text("status", { enum: TIMESHEET_STATUSES }).notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    approvedVersion: integer("approved_version"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.workerId, t.weekStart), index().on(t.companyId, t.weekStart, t.status)],
);

export const VERSION_CAUSES = ["submitted", "resubmitted", "admin_submitted", "manager_correction", "reopened", "rates_changed"] as const;

export const timesheetVersions = pgTable(
  "timesheet_versions",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id),
    versionNo: integer("version_no").notNull(),
    cause: text("cause", { enum: VERSION_CAUSES }).notNull(),
    causeReason: text("cause_reason"),
    createdBy: uuid("created_by").references(() => companyMembers.id),
    createdAt: createdAt(),
    returnedAt: ts("returned_at"),
    returnedBy: uuid("returned_by").references(() => companyMembers.id),
    returnComment: text("return_comment"),
    approvedAt: ts("approved_at"),
    approvedBy: uuid("approved_by").references(() => companyMembers.id),
    snapshot: jsonb("snapshot").notNull(),
    totalSeconds: integer("total_seconds").notNull(),
    totalValue: numeric("total_value", { precision: 12, scale: 2 }),
  },
  (t) => [unique().on(t.timesheetId, t.versionNo)],
);

export const timesheetComments = pgTable("timesheet_comments", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id),
  entryId: uuid("entry_id"),
  authorId: uuid("author_id").notNull().references(() => companyMembers.id),
  kind: text("kind", { enum: ["comment", "correction_request", "return", "reopen"] }).notNull().default("comment"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const ENTRY_STATUSES = ["open", "closed", "void"] as const;
export const RATE_STATUSES = ["pending", "ok", "missing", "conflict"] as const;
export type RateStatus = (typeof RATE_STATUSES)[number];

/**
 * One worker, one project, one role per entry (ARD p.3). Additional constraints are in the custom
 * migration: one open entry per worker, and no overlapping non-void entries per worker.
 */
export const workEntries = pgTable(
  "work_entries",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workerId: uuid("worker_id").notNull().references(() => companyMembers.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    jobRoleId: uuid("job_role_id").notNull().references(() => jobRoles.id),
    timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at"),
    durationSeconds: integer("duration_seconds"),
    rateId: uuid("rate_id").references(() => rates.id),
    appliedRate: numeric("applied_rate", { precision: 10, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    value: numeric("value", { precision: 12, scale: 2 }),
    rateStatus: text("rate_status", { enum: RATE_STATUSES }).notNull().default("pending"),
    status: text("status", { enum: ENTRY_STATUSES }).notNull().default("open"),
    source: text("source", { enum: ["clock", "manager"] }).notNull().default("clock"),
    splitGroupId: uuid("split_group_id"),
    clockInKey: uuid("clock_in_key").unique(),
    clockOutKey: uuid("clock_out_key").unique(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("work_entries_one_open_per_worker").on(t.workerId).where(sql`status = 'open'`),
    index().on(t.timesheetId),
    index().on(t.companyId, t.projectId),
    check("entry_end_after_start", sql`${t.endAt} IS NULL OR ${t.endAt} > ${t.startAt}`),
    check("entry_open_has_no_end", sql`${t.status} <> 'open' OR ${t.endAt} IS NULL`),
    check("entry_closed_has_end", sql`${t.status} <> 'closed' OR ${t.endAt} IS NOT NULL`),
  ],
);

export const entryRevisions = pgTable(
  "entry_revisions",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    entryId: uuid("entry_id").notNull().references(() => workEntries.id),
    action: text("action", { enum: ["corrected", "reconstructed", "voided", "created", "split"] }).notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason").notNull(),
    editedBy: uuid("edited_by").notNull().references(() => companyMembers.id),
    editedAt: ts("edited_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.entryId), check("revision_reason_required", sql`length(trim(${t.reason})) > 0`)],
);

// ---------------------------------------------------------------------------
// Exports, audit, errors
// ---------------------------------------------------------------------------

export const exportsLog = pgTable("exports", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  memberId: uuid("member_id").notNull().references(() => companyMembers.id),
  scope: text("scope").notNull(), // team | company | costmaster
  filters: jsonb("filters").notNull(),
  rowCount: integer("row_count").notNull(),
  totalSeconds: integer("total_seconds").notNull(),
  totalValue: numeric("total_value", { precision: 12, scale: 2 }).notNull(),
  createdAt: createdAt(),
});

export const exportItems = pgTable(
  "export_items",
  {
    exportId: uuid("export_id").notNull().references(() => exportsLog.id),
    entryId: uuid("entry_id").notNull().references(() => workEntries.id),
    timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id),
    versionNo: integer("version_no").notNull(),
  },
  (t) => [primaryKey({ columns: [t.exportId, t.entryId] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: uuid("company_id").references(() => companies.id),
    actorId: uuid("actor_id").references(() => companyMembers.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.companyId, t.createdAt)],
);

export const errorLog = pgTable("error_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: createdAt(),
});
