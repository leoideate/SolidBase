import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { canExportTeam, hasSupportAccess } from "@/server/authz";
import { companyLookups, teamOverview } from "@/server/services/views";
import { addWeekToDate, isWeekStart, weekLabel, weekStartOf } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";
import { Hours, Money, Stat, StatusBadge } from "@/components/ui";

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
    <div data-page="team-overview" className="space-y-5">
      <div className="pb-2">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          TEAM MANAGEMENT
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="h1">Team overview</h1>
            <p className="muted mt-1 text-[#66545d]">{actor.isAdmin ? "Whole business" : actor.isManager ? "Your assigned workers only" : "Read-only support access"}</p>
          </div>
          {canExport && <a className="btn-secondary border-[#b88340] bg-[#fcf5e9]! px-6 hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]" href={`/api/export?${exportQs}`}>Download approved CSV</a>}
        </div>
      </div>
      <form className="grid gap-4 rounded-[20px] border border-[#ded5c9] bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.65fr)_minmax(0,0.65fr)_minmax(7rem,0.65fr)] sm:p-5" method="get">
        <div>
          <label className="label" htmlFor="overview-week">Week</label>
          <select id="overview-week" name="week" className="input" defaultValue={week ?? "all"}>
            <option value="all">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>{weekLabel(w)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="overview-worker">Worker</label>
          <select id="overview-worker" name="worker" className="input" defaultValue={sp.worker ?? ""}>
            <option value="">All</option>
            {data.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="overview-project">Project</label>
          <select id="overview-project" name="project" className="input" defaultValue={sp.project ?? ""}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="overview-status">Status</label>
          <select id="overview-status" name="status" className="input" defaultValue={sp.status ?? ""}>
            <option value="">All</option>
            {["draft", "submitted", "returned", "approved"].map((s) => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Apply</button>
        </div>
      </form>

      <div className="overview-stats grid gap-4 sm:grid-cols-2">
        <Stat label="Approved hours" value={hours(data.approved.seconds)} />
        <Stat label="Approved labour value" value={fmtMoney(data.approved.value)} sub="Agreed worker rates, before deductions" />
      </div>

      {data.byProjectRole.length > 0 && (
        <section className="overflow-hidden rounded-[18px] border border-[#ded5c9] bg-white">
          <h2 className="h2 px-4 pt-4">Approved by project and role</h2>
          <div className="overflow-x-auto">
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
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[18px] border border-[#ded5c9] bg-white">
        <h2 className="h2 px-4 pt-4">Timesheets</h2>
        {data.sheets.length === 0 ? (
          <div className="flex min-h-[90px] items-center justify-center p-6 text-center text-sm text-[#66545d]">No timesheets match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table mt-2">
              <thead>
                <tr><th>Worker</th><th>Week</th><th>Status</th><th className="num">Hours</th><th className="num">Value</th></tr>
              </thead>
              <tbody>
                {data.sheets.map((s) => (
                  <tr key={s.ts.id}>
                    <td>
                      <Link className="font-medium text-[#92621e] hover:underline focus-visible:outline-2 focus-visible:outline-[#92754e]" href={`/team/timesheets/${s.ts.id}`}>{s.name}</Link>
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
