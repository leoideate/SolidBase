import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listMembers, listRates, rateProblems } from "@/server/services/admin-views";
import { companyLookups } from "@/server/services/views";
import { SPECIFICITY_LABEL, specificity } from "@/server/services/rates";
import { fmtMoney } from "@/lib/money";
import { fmtDateTime, localDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FlagBadge, PageHeader } from "@/components/ui";
import { addRateAction, endRateAction } from "../actions";

export const dynamic = "force-dynamic";

/** F04: agreed hourly worker rates in EUR with effective dates and worker/project overrides. */
export default async function RatesPage() {
  const actor = await requireActor();
  const [rates, problems, { projects, roles }, members] = await Promise.all([listRates(actor), rateProblems(actor), companyLookups(actor.companyId), listMembers(actor)]);
  const workers = members.filter((x) => x.m.isWorker);
  const today = localDate(new Date());

  return (
    <div className="space-y-4">
      <PageHeader title="Rates" subtitle="Worker pay rates (not client billing rates). The most specific active rate applies: worker + project > worker > project > role standard." />

      {problems.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="h2 text-red-900">Entries blocked by rate problems ({problems.length})</h2>
          <p className="mt-1 text-sm text-red-900">Add or end rates so exactly one applies. Affected entries are re-priced automatically.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {problems.slice(0, 20).map((p) => (
              <li key={p.entryId} className="flex flex-wrap items-center gap-2">
                <FlagBadge label={p.rateStatus === "missing" ? "No rate" : "Conflict"} />
                <Link className="text-blue-700 hover:underline" href={`/team/timesheets/${p.timesheetId}`}>
                  {p.workerName} · {p.projectCode} · {p.roleName} · {fmtDateTime(p.startAt)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Applies to</th>
              <th className="num">Rate</th>
              <th>From</th>
              <th>To</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map(({ r, roleName, projectCode, workerName }) => {
              const active = r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today);
              return (
                <tr key={r.id} className={active ? "" : "text-slate-400"}>
                  <td className="font-medium">{roleName}</td>
                  <td className="text-xs">
                    <div className="font-semibold">{SPECIFICITY_LABEL[specificity(r)]}</div>
                    {[workerName, projectCode].filter(Boolean).join(" · ")}
                  </td>
                  <td className="num font-semibold">{fmtMoney(r.hourlyRate)}</td>
                  <td className="whitespace-nowrap">{r.effectiveFrom}</td>
                  <td className="whitespace-nowrap">{r.effectiveTo ?? "—"}</td>
                  <td>
                    {!r.effectiveTo && (
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-700">End</summary>
                        <ActionForm action={endRateAction} className="mt-1 flex gap-1">
                          <input type="hidden" name="rateId" value={r.id} />
                          <input type="date" name="effectiveTo" className="input min-h-9 py-1" defaultValue={today} required />
                          <SubmitButton className="btn-secondary btn-sm">Set</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2 className="h2 mb-1">Add rate</h2>
        <p className="muted mb-3">To change a rate, add a new one with a later effective date; it supersedes the earlier rate at the same level. Approved entries keep the rate they were approved with.</p>
        <ActionForm action={addRateAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" resetOnSuccess>
          <div>
            <label className="label">Role</label>
            <select name="jobRoleId" className="input" required>
              <option value="">Choose…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Worker (optional override)</label>
            <select name="workerId" className="input">
              <option value="">All workers</option>
              {workers.map((w) => (
                <option key={w.m.id} value={w.m.id}>{w.u.displayName} ({w.m.workerCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Project (optional override)</label>
            <select name="projectId" className="input">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Hourly rate (EUR)</label>
            <input name="hourlyRate" className="input" inputMode="decimal" placeholder="28.00" required />
          </div>
          <div>
            <label className="label">Effective from</label>
            <input type="date" name="effectiveFrom" className="input" defaultValue={today} required />
          </div>
          <div>
            <label className="label">Effective to (optional)</label>
            <input type="date" name="effectiveTo" className="input" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton>Add rate</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
