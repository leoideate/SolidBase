import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listMembers, listRates, rateProblems } from "@/server/services/admin-views";
import { companyLookups } from "@/server/services/views";
import { SPECIFICITY_LABEL, specificity } from "@/server/services/rates";
import { fmtRate } from "@/lib/money";
import { fmtDateTime, localDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DatePicker } from "@/components/date-picker";
import { FlagBadge } from "@/components/ui";
import { addRateAction, endRateAction } from "../actions";

export const dynamic = "force-dynamic";

/** F04: agreed hourly or day worker rates in EUR with effective dates and worker/project overrides. */
export default async function RatesPage() {
  const actor = await requireActor();
  const [rates, problems, { projects, roles }, members] = await Promise.all([listRates(actor), rateProblems(actor), companyLookups(actor.companyId), listMembers(actor)]);
  const workers = members.filter((x) => x.m.isWorker);
  const today = localDate(new Date());

  return (
    <div data-page="admin-rates" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Rates</h1>
        <p className="muted mt-1 text-[#66545d]">Worker pay rates (not client billing rates). The most specific active rate applies: worker + project &gt; worker &gt; project &gt; role standard.</p>
      </div>

      {problems.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="h2 text-red-900">Entries blocked by rate problems ({problems.length})</h2>
          <p className="mt-1 text-sm text-red-900">Add or end rates so exactly one applies. Affected entries are re-priced automatically.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {problems.slice(0, 20).map((p) => (
              <li key={p.entryId} className="flex flex-wrap items-center gap-2">
                <FlagBadge label={p.rateStatus === "missing" ? "No rate" : "Conflict"} />
                <Link className="text-[#92621e] hover:underline" href={`/team/timesheets/${p.timesheetId}`}>
                  {p.workerName} · {p.projectCode} · {p.roleName} · {fmtDateTime(p.startAt)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-[18px] border border-[#ded5c9] bg-white">
        <table className="table min-w-[850px] table-fixed">
          <colgroup>
            <col />
            <col />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-[232px]" />
          </colgroup>
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
                  <td className="num font-semibold whitespace-nowrap">{fmtRate(r.hourlyRate, r.unit)}</td>
                  <td className="whitespace-nowrap">{r.effectiveFrom}</td>
                  <td className="whitespace-nowrap">{r.effectiveTo ?? "—"}</td>
                  <td>
                    {!r.effectiveTo && (
                      <details>
                        <summary className="cursor-pointer text-xs text-[#92621e]">End</summary>
                        <ActionForm action={endRateAction} className="end-rate-form mt-1 flex w-[13rem] items-center gap-1">
                          <input type="hidden" name="rateId" value={r.id} />
                          <DatePicker id={`end-rate-${r.id}`} name="effectiveTo" defaultValue={today} today={today} portal />
                          <SubmitButton className="btn-secondary btn-sm border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Set</SubmitButton>
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

      <section className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <h2 className="h2 mb-1">Add rate</h2>
        <p className="muted mb-4 text-[#66545d]">To change a rate, add a new one with a later effective date; it supersedes the earlier rate at the same level. Approved entries keep the rate they were approved with. A day rate pays the agreed amount for each day worked, whatever the hours; two day-rate entries on the same day must be combined before approval.</p>
        <ActionForm action={addRateAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" resetOnSuccess>
          <div>
            <label className="label" htmlFor="rate-jobRoleId">Role</label>
            <select id="rate-jobRoleId" name="jobRoleId" className="input" required>
              <option value="">Choose…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rate-workerId">Worker (optional override)</label>
            <select id="rate-workerId" name="workerId" className="input">
              <option value="">All workers</option>
              {workers.map((w) => (
                <option key={w.m.id} value={w.m.id}>{w.u.displayName} ({w.m.workerCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rate-projectId">Project (optional override)</label>
            <select id="rate-projectId" name="projectId" className="input">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Agreed pay rate (EUR)</label>
            <div className="flex gap-2">
              <input name="hourlyRate" className="input min-w-0 flex-1" inputMode="decimal" placeholder="28.00" aria-label="Amount" required />
              <select name="unit" className="input w-32 shrink-0" defaultValue="hour" aria-label="Rate type">
                <option value="hour">per hour</option>
                <option value="day">per day</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rate-from">Effective from</label>
            <DatePicker id="rate-from" name="effectiveFrom" defaultValue={today} today={today} />
          </div>
          <div>
            <label className="label" htmlFor="rate-to">Effective to (optional)</label>
            <DatePicker id="rate-to" name="effectiveTo" defaultValue="" today={today} required={false} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Add rate</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
