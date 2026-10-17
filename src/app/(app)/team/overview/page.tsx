import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { canExportTeam, hasSupportAccess } from "@/server/authz";
import { companyLookups, teamOverview } from "@/server/services/views";
import { addWeekToDate, isWeekStart, weekLabel, weekStartOf } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";
import { Empty, Hours, Money, PageHeader, Stat, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Promise<{ week?: string; worker?: string; project?: string; status?: string }>;

export default async function TeamOverviewPage({ searchParams }: { searchParams: SP }) {
  const actor = await requireActor();
  const support = await hasSupportAccess(db, actor);
  if (!actor.isManager && !actor.isAdmin && !support) redirect("/");
  const sp = await searchParams;
  const lastWeek = addWeekToDate(weekStartOf(new Date()), -1);
  const week = sp.week === "all" ? undefined : sp.week && isWeekStart(sp.week) ? sp.week : lastWeek;
  const data = await teamOverview(actor, { weekStart: week, workerId: sp.worker || undefined, projectId: sp.project || undefined, status: sp.status || undefined });
  const { projects } = await companyLookups(actor.companyId);
  const canExport = await canExportTeam(db, actor);
  const weeks = Array.from({ length: 12 }, (_, i) => addWeekToDate(weekStartOf(new Date()), -i));
  const exportFrom = week ?? addWeekToDate(lastWeek, -11);
  const exportTo = week ?? weekStartOf(new Date());
  const exportQs = new URLSearchParams({ scope: "team", from: exportFrom, to: exportTo, ...(sp.worker ? { worker: sp.worker } : {}), ...(sp.project ? { project: sp.project } : {}) });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team overview"
        subtitle={actor.isAdmin ? "Whole business" : actor.isManager ? "Your assigned workers only" : "Read-only support access"}
        actions={canExport ? <a className="btn-brand" href={`/api/export?${exportQs}`}>Download approved CSV</a> : undefined}
      />
      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
        <div>
          <label className="label">Week</label>
          <select name="week" className="input" defaultValue={week ?? "all"}>
            <option value="all">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>{weekLabel(w)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Worker</label>
          <select name="worker" className="input" defaultValue={sp.worker ?? ""}>
            <option value="">All</option>
            {data.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select name="project" className="input" defaultValue={sp.project ?? ""}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">All</option>
            {["draft", "submitted", "returned", "approved"].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Apply</button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Approved hours" value={hours(data.approved.seconds)} tone="good" />
        <Stat label="Approved labour value" value={fmtMoney(data.approved.value)} tone="good" sub="Agreed worker rates, before deductions" />
      </div>

      {data.byProjectRole.length > 0 && (
        <section className="card overflow-x-auto p-0 sm:p-0">
          <h2 className="h2 px-4 pt-4">Approved by project and role</h2>
          <table className="table mt-2">
            <thead>
              <tr><th>Project</th><th>Role</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Value</th></tr>
            </thead>
            <tbody>
              {data.byProjectRole.map((b, i) => (
                <tr key={i}>
                  <td><span className="font-semibold">{b.projectCode}</span> <span className="hidden text-slate-500 sm:inline">{b.projectName}</span></td>
                  <td>{b.roleName}</td>
                  <td className="num"><Hours s={b.seconds} /></td>
                  <td className="num">{fmtMoney(b.rate)}</td>
                  <td className="num"><Money v={b.value} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="h2">Timesheets</h2>
        {data.sheets.length === 0 ? (
          <Empty>No timesheets match these filters.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="table">
              <thead>
                <tr><th>Worker</th><th>Week</th><th>Status</th><th className="num">Hours</th><th className="num">Value</th></tr>
              </thead>
              <tbody>
                {data.sheets.map((s) => (
                  <tr key={s.ts.id}>
                    <td>
                      <Link className="font-medium text-blue-700 hover:underline" href={`/team/timesheets/${s.ts.id}`}>{s.name}</Link>
                      <div className="text-xs text-slate-500">{s.workerCode}</div>
                    </td>
                    <td className="whitespace-nowrap">{weekLabel(s.ts.weekStart)}</td>
                    <td><StatusBadge status={s.ts.status} /></td>
                    <td className="num"><Hours s={s.seconds} /></td>
                    <td className="num"><Money v={s.unpriced ? null : s.value} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
