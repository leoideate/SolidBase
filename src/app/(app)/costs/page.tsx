import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { COST_BASIS, costReport, hasCostAccess } from "@/server/services/costmaster";
import { addWeekToDate, fmtDate, isWeekStart, localDate, weekLabel, weekStartOf, fmtTime } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";
import { Empty, Hours, Money, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Promise<{ from?: string; to?: string; project?: string; drill?: string }>;

/** CostMaster release 1 (C01, C02): approved labour by project, week and role, authorised projects only. */
export default async function CostsPage({ searchParams }: { searchParams: SP }) {
  const actor = await requireActor();
  if (!(await hasCostAccess(actor))) {
    // Members with no access roles land here; show a message rather than redirecting in a loop.
    if (actor.isWorker || actor.isManager || actor.isAdmin || actor.isIt) redirect("/");
    return <Empty>Your account has no access assigned yet. Ask your administrator.</Empty>;
  }
  const sp = await searchParams;
  const thisWeek = weekStartOf(new Date());
  const from = sp.from && isWeekStart(sp.from) ? sp.from : addWeekToDate(thisWeek, -7);
  const to = sp.to && isWeekStart(sp.to) ? sp.to : thisWeek;
  const r = await costReport(actor, { fromWeek: from, toWeek: to, projectId: sp.project || undefined });
  const weeks = Array.from({ length: 26 }, (_, i) => addWeekToDate(thisWeek, -i));
  const totalSeconds = r.byProject.reduce((s, p) => s + p.seconds, 0);
  const totalValue = r.byProject.reduce((s, p) => s + Number(p.value), 0).toFixed(2);
  const [drillProject, drillWeek] = (sp.drill ?? "").split("|");
  const drillRows = sp.drill ? r.entries.filter((e) => e.projectId === drillProject && e.weekStart === drillWeek) : [];
  const qs = (extra: Record<string, string>) => new URLSearchParams({ from, to, ...(sp.project ? { project: sp.project } : {}), ...extra }).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="CostMaster"
        subtitle={r.allProjects ? "All projects" : `${r.projects.length} authorised project(s)`}
        actions={r.canExport ? <a className="btn-brand" href={`/api/export?${new URLSearchParams({ scope: "costmaster", from, to, ...(sp.project ? { project: sp.project } : {}) })}`}>Download CSV</a> : undefined}
      />
      <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <strong>Cost basis:</strong> {COST_BASIS}
      </p>

      <form className="card grid gap-3 sm:grid-cols-4" method="get">
        <div>
          <label className="label">From week</label>
          <select name="from" className="input" defaultValue={from}>
            {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">To week</label>
          <select name="to" className="input" defaultValue={to}>
            {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select name="project" className="input" defaultValue={sp.project ?? ""}>
            <option value="">All authorised</option>
            {r.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full">Apply</button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Approved labour hours" value={hours(totalSeconds)} />
        <Stat label="Approved labour value" value={fmtMoney(totalValue)} />
        <Stat label="Equipment" value="Not included" tone="muted" sub="Module not available yet" />
        <Stat label="Admin allocations · Materials" value="Not included" tone="muted" sub="Module not available yet" />
      </div>

      <section className="card overflow-x-auto p-0 sm:p-0">
        <h2 className="h2 px-4 pt-4">By project</h2>
        <table className="table mt-2">
          <thead>
            <tr><th>Project</th><th>Site ref</th><th className="num">Hours</th><th className="num">Labour value</th><th className="num">Included cost total</th></tr>
          </thead>
          <tbody>
            {r.byProject.map((p) => (
              <tr key={p.id}>
                <td><span className="font-semibold">{p.code}</span> {p.name}</td>
                <td>{p.siteRef ?? "—"}</td>
                <td className="num"><Hours s={p.seconds} /></td>
                <td className="num"><Money v={p.value} /></td>
                <td className="num"><Money v={p.value} /> <span className="block text-xs text-slate-500">labour only</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="h2">By project, week and role</h2>
        {r.byLine.length === 0 ? (
          <Empty>No approved labour in this period.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0 sm:p-0">
            <table className="table">
              <thead>
                <tr><th>Project</th><th>Week</th><th>Role</th><th className="num">Hours</th><th className="num">Value</th><th></th></tr>
              </thead>
              <tbody>
                {r.byLine.map((l, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{l.projectCode}</td>
                    <td className="whitespace-nowrap">{weekLabel(l.weekStart)}</td>
                    <td>{l.roleName}</td>
                    <td className="num"><Hours s={l.seconds} /></td>
                    <td className="num"><Money v={l.value} /></td>
                    <td><a className="text-xs text-blue-700 hover:underline" href={`/costs?${qs({ drill: `${l.projectId}|${l.weekStart}` })}#drill`}>Entries</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sp.drill && (
        <section id="drill" className="card overflow-x-auto">
          <h2 className="h2 mb-2">Source entries · {drillRows[0]?.projectCode} · {drillWeek && weekLabel(drillWeek)}</h2>
          <table className="table">
            <thead>
              <tr><th>Worker</th><th>Date</th><th>Time</th><th>Role</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Value</th><th>Approved</th></tr>
            </thead>
            <tbody>
              {drillRows.map((e) => (
                <tr key={e.entryId}>
                  <td>{e.workerName}</td>
                  <td className="whitespace-nowrap">{fmtDate(localDate(e.startAt))}</td>
                  <td className="whitespace-nowrap">{fmtTime(e.startAt)}–{fmtTime(e.endAt)}</td>
                  <td>{e.roleName}</td>
                  <td className="num"><Hours s={e.durationSeconds} /></td>
                  <td className="num">{fmtMoney(e.appliedRate)}</td>
                  <td className="num"><Money v={e.value} /></td>
                  <td className="text-xs">v{e.approvedVersion} · {e.approvedByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
