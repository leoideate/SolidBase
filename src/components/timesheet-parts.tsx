import { breakdown, entryFlags, totals } from "@/server/services/views";
import type { EntryRow } from "@/server/services/views";
import { fmtDateTime, fmtTime, localDate, fmtDate } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";
import { FlagBadge, Hours, Money, Stat, StatusBadge } from "./ui";

type WeekData = Awaited<ReturnType<typeof import("@/server/services/views").workerWeek>>;

/** Dashboard totals (ARD p.4): approved figures prominent, unapproved separated and excluded. */
export function WeekStats({ data }: { data: WeekData }) {
  const t = totals(data.entries);
  const approved = data.timesheet?.status === "approved";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Approved hours" value={approved ? hours(t.seconds) : "0.00"} tone={approved ? "good" : "muted"} />
      <Stat label="Approved value" value={approved ? fmtMoney(t.value) : fmtMoney("0")} tone={approved ? "good" : "muted"} sub="Before deductions" />
      <Stat
        label="Not yet approved"
        value={approved ? "0.00" : hours(t.seconds)}
        sub={!approved && t.seconds > 0 ? `${fmtMoney(t.value)} est.${t.unpriced ? " · rate missing" : ""}` : "hours"}
      />
      <Stat label="Status" value={data.timesheet ? data.timesheet.status[0].toUpperCase() + data.timesheet.status.slice(1) : "No entries"} sub={data.timesheet?.currentVersion ? `Version ${data.timesheet.currentVersion}` : undefined} />
    </div>
  );
}

export function BreakdownTable({ entries }: { entries: EntryRow[] }) {
  const rows = breakdown(entries);
  const t = totals(entries);
  if (rows.length === 0) return null;
  return (
    <div className="card overflow-x-auto p-0 sm:p-0">
      <table className="table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Role</th>
            <th className="num">Hours</th>
            <th className="num">Rate</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <span className="font-semibold">{r.projectCode}</span> <span className="hidden text-slate-500 sm:inline">{r.projectName}</span>
              </td>
              <td>{r.roleName}</td>
              <td className="num"><Hours s={r.seconds} /></td>
              <td className="num">{r.rate ? fmtMoney(r.rate) : <span className="text-red-700">No rate</span>}</td>
              <td className="num"><Money v={r.value} /></td>
            </tr>
          ))}
          <tr className="font-bold">
            <td colSpan={2}>Total</td>
            <td className="num"><Hours s={t.seconds} /></td>
            <td />
            <td className="num"><Money v={t.unpriced ? null : t.value} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Entries list: stacked cards on phones, table on wider screens (Q03). */
export function EntriesList({
  entries,
  longShiftHours,
  renderActions,
}: {
  entries: EntryRow[];
  longShiftHours: number;
  renderActions?: (e: EntryRow) => React.ReactNode;
}) {
  if (entries.length === 0) return <p className="muted">No entries this week.</p>;
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {entries.map((e) => (
          <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{fmtDate(localDate(e.startAt))}</div>
                <div className="text-sm text-slate-600">
                  {fmtTime(e.startAt)} – {e.endAt ? fmtTime(e.endAt) : "open"}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{e.durationSeconds != null ? `${hours(e.durationSeconds)} h` : "—"}</div>
                <div className="text-sm"><Money v={e.value} /></div>
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{e.projectCode}</span> · {e.roleName}
              {e.appliedRate && <span className="text-slate-500"> · {fmtMoney(e.appliedRate)}/h</span>}
            </div>
            <EntryBadges e={e} longShiftHours={longShiftHours} />
            {renderActions && <div className="mt-2">{renderActions(e)}</div>}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>In</th>
              <th>Out</th>
              <th>Project</th>
              <th>Role</th>
              <th className="num">Hours</th>
              <th className="num">Rate</th>
              <th className="num">Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{fmtDate(localDate(e.startAt))}</td>
                <td>{fmtTime(e.startAt)}</td>
                <td>{e.endAt ? fmtTime(e.endAt) : <StatusBadge status="open" />}</td>
                <td title={e.projectName}>{e.projectCode}</td>
                <td>{e.roleName}</td>
                <td className="num">{e.durationSeconds != null ? hours(e.durationSeconds) : "—"}</td>
                <td className="num">{e.appliedRate ? fmtMoney(e.appliedRate) : "—"}</td>
                <td className="num"><Money v={e.value} /></td>
                <td>
                  <EntryBadges e={e} longShiftHours={longShiftHours} />
                  {renderActions?.(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EntryBadges({ e, longShiftHours }: { e: EntryRow; longShiftHours: number }) {
  const flags = entryFlags(e, longShiftHours);
  if (!flags.length && e.source === "clock" && !e.splitGroupId) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {flags.map((f) => (
        <FlagBadge key={f.code} label={f.label} />
      ))}
      {e.source === "manager" && <span className="badge bg-violet-100 text-violet-800">Added by manager</span>}
      {e.splitGroupId && <span className="badge bg-slate-100 text-slate-600">Split at week end</span>}
    </div>
  );
}

export function HistoryPanel({ data }: { data: WeekData }) {
  if (!data.timesheet) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card">
        <h2 className="h2 mb-2">Messages</h2>
        {data.comments.length === 0 ? (
          <p className="muted">No messages.</p>
        ) : (
          <ul className="space-y-2">
            {data.comments.map(({ c, author }) => (
              <li key={c.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{author}</span>
                  <span>{fmtDateTime(c.createdAt)}</span>
                  {c.kind !== "comment" && <span className="badge bg-amber-100 text-amber-900">{c.kind.replace("_", " ")}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="h2 mb-2">Versions and corrections</h2>
        <ul className="space-y-2 text-sm">
          {data.versions.map(({ v, createdByName, approvedByName }) => (
            <li key={v.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Version {v.versionNo}</span>
                <span className="text-slate-500">{v.cause === "admin_submitted" ? "submitted on behalf" : v.cause.replace("_", " ")}</span>
                {v.approvedAt && <span className="badge bg-emerald-100 text-emerald-800">Approved</span>}
                {v.returnedAt && <span className="badge bg-amber-100 text-amber-900">Returned</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {fmtDateTime(v.createdAt)} by {createdByName ?? "—"} · {hours(v.totalSeconds)} h · {fmtMoney(v.totalValue)}
                {v.causeReason && <> · “{v.causeReason}”</>}
              </div>
              {v.approvedAt && (
                <div className="mt-1 text-xs text-emerald-800">
                  Approved by {approvedByName} on {fmtDateTime(v.approvedAt)}
                </div>
              )}
            </li>
          ))}
          {data.revisions.map(({ r, editor }) => (
            <li key={r.id} className="rounded-xl bg-violet-50 p-3">
              <div className="font-semibold capitalize">Entry {r.action}</div>
              <div className="text-xs text-slate-600">
                {fmtDateTime(r.editedAt)} by {editor} · Reason: “{r.reason}”
              </div>
              <RevisionDiff before={r.before as Rec | null} after={r.after as Rec | null} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Rec = Record<string, unknown>;

function RevisionDiff({ before, after }: { before: Rec | null; after: Rec | null }) {
  if (!before || !after) return null;
  const keys = ["startAt", "endAt", "durationSeconds", "appliedRate", "value", "status"] as const;
  const fmt = (k: string, v: unknown) => {
    if (v == null) return "—";
    if (k === "startAt" || k === "endAt") return fmtDateTime(new Date(String(v)));
    if (k === "durationSeconds") return `${hours(Number(v))} h`;
    if (k === "value" || k === "appliedRate") return fmtMoney(String(v));
    return String(v);
  };
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const allocationChanged = before.projectId !== after.projectId || before.jobRoleId !== after.jobRoleId;
  return (
    <ul className="mt-1 text-xs text-slate-700">
      {allocationChanged && <li>Project or role changed</li>}
      {changed.map((k) => (
        <li key={k}>
          {k}: <s className="text-slate-400">{fmt(k, before[k])}</s> → {fmt(k, after[k])}
        </li>
      ))}
    </ul>
  );
}
