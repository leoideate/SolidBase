import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { crewEntriesOn, crewTimesheetsFor, listCrew } from "@/server/services/crew";
import { companyLookups } from "@/server/services/views";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/ui";
import { TickAll, TimeSelect } from "@/components/time-select";
import { DatePicker } from "@/components/date-picker";
import { crewHoursAction } from "../actions";

export const dynamic = "force-dynamic";

/** Supervisor records a day's hours for their crew on one project (role, start, end per worker). */
export default async function CrewHoursPage({ searchParams }: { searchParams: Promise<{ date?: string; project?: string }> }) {
  const actor = await requireActor();
  if (!actor.isManager && !actor.isAdmin) redirect("/");
  const sp = await searchParams;
  const today = localDate(new Date());
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const [allCrew, lookups] = await Promise.all([listCrew(actor), companyLookups(actor.companyId)]);
  const crew = allCrew.filter((w) => w.isActive);
  const projects = lookups.projects.filter((p) => p.isActive);
  const projectId = projects.some((p) => p.id === sp.project) ? sp.project! : "";
  const ids = crew.map((w) => w.id);
  const [entries, sheets] = await Promise.all([crewEntriesOn(actor, date, ids), crewTimesheetsFor(actor, date, ids)]);
  const roleName = new Map(lookups.roles.map((r) => [r.id, r.name]));

  return (
    <div data-page="crew-hours" className="space-y-6">
      <div className="pb-2 sm:pb-3">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          TIME ENTRY
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="h1">Enter crew hours</h1>
            <p className="muted mt-1 text-[#66545d]">Record the hours your workers did on one project for one day.</p>
          </div>
          <Link href="/team/crew" className="btn-secondary border-[#a99576] bg-[#f2ebdf] px-6 hover:bg-[#e9ddca] focus-visible:outline-[#92754e]">My crew</Link>
        </div>
      </div>

      <form method="get" className="grid gap-5 rounded-[20px] border border-[#ded5c9] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.87fr)_auto] sm:items-end sm:p-6">
        <div>
          <label className="label text-[#66545d]" htmlFor="date">Day</label>
          <DatePicker key={date} id="date" name="date" defaultValue={date} max={today} />
        </div>
        <div>
          <label className="label text-[#66545d]" htmlFor="project">Project</label>
          <div className="relative">
          <select id="project" name="project" className="input appearance-none border-[#d9cfc1] pr-10 focus:border-[#a99576] focus:ring-[#eee5d7]" defaultValue={projectId} required>
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <svg aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m7 10 5 5 5-5" /></svg>
          </div>
        </div>
        <button className="btn-secondary border-[#cbbba5] px-6 hover:bg-[#f5f1eb] focus-visible:outline-[#92754e]">Show</button>
      </form>

      {crew.length === 0 ? (
        <div className="flex min-h-[100px] flex-wrap items-center justify-center gap-x-1 rounded-[20px] border border-[#d9cfc1] bg-white/75 p-6 text-center text-sm text-[#66545d]">
          <p>No workers in your crew. <Link href="/team/crew" className="font-semibold text-[#a4834e] underline underline-offset-2">Add workers</Link> first.</p>
        </div>
      ) : !projectId ? (
        <div className="flex min-h-[100px] items-center justify-center rounded-[20px] border border-[#d9cfc1] bg-white/75 p-6 text-center text-sm text-[#66545d]">Choose a day and a project to start.</div>
      ) : (
        <ActionForm action={crewHoursAction} className="crew-hours-form space-y-3 rounded-[20px] border border-[#d9cfc1] bg-white/75 p-4 sm:p-6">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="projectId" value={projectId} />
          <p className="muted">
            {fmtDate(date)}. Tick each worker who worked, then check their role, start, end (5-minute steps), unpaid break and what work was done. Type a rate only to set or change that worker's hourly rate for the role from this day; leave it blank to keep the current rate. An end time earlier than the start counts as the next morning.
          </p>
          <TickAll />
          <ul className="divide-y divide-slate-200">
            {crew.map((w) => {
              const roleIds = w.roleIds.length ? w.roleIds : lookups.roles.filter((r) => r.isActive).map((r) => r.id);
              const done = entries.filter((e) => e.workerId === w.id);
              const sheet = sheets.find((s) => s.workerId === w.id);
              return (
                <li key={w.id} className="grid gap-2 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_9rem_9rem_7.5rem_6rem_minmax(0,1.5fr)] xl:items-center">
                  <input type="hidden" name="workerId" value={w.id} />
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name={`on_${w.id}`} className="mt-1 size-5 shrink-0" aria-label={`${w.name} worked`} disabled={sheet?.status === "approved"} />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {w.name} <span className="text-xs font-normal text-slate-500">{w.workerCode}</span>
                      </span>
                      {done.length > 0 && (
                        <span className="block text-xs text-slate-600">
                          Already recorded: {done.map((e) => `${fmtTime(e.startAt)}–${e.endAt ? fmtTime(e.endAt) : "open"} ${e.projectCode} ${e.roleName}`).join("; ")}
                        </span>
                      )}
                      {sheet && sheet.status !== "draft" && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs">
                          Week <StatusBadge status={sheet.status} />
                        </span>
                      )}
                    </span>
                  </label>
                  <select name={`role_${w.id}`} className="input" aria-label={`${w.name} role`} defaultValue={roleIds[0]}>
                    {roleIds.map((id) => (
                      <option key={id} value={id}>
                        {roleName.get(id)}
                      </option>
                    ))}
                  </select>
                  <TimeSelect name={`start_${w.id}`} defaultValue="07:00" label={`${w.name} start`} />
                  <TimeSelect name={`end_${w.id}`} defaultValue="15:30" label={`${w.name} end`} />
                  <select name={`break_${w.id}`} className="input" defaultValue="30" aria-label={`${w.name} unpaid break minutes`} title="Unpaid break (minutes)">
                    {[0, 15, 30, 45, 60, 75, 90].map((n) => (
                      <option key={n} value={n}>{n ? `${n} min break` : "No break"}</option>
                    ))}
                  </select>
                  <input name={`rate_${w.id}`} inputMode="decimal" className="input" placeholder="Rate €/h" aria-label={`${w.name} hourly rate (optional)`} title="Optional. Sets this worker's hourly rate for the chosen role from this day." autoComplete="off" />
                  <input name={`note_${w.id}`} className="input" placeholder="Work done" aria-label={`${w.name} work done`} />
                </li>
              );
            })}
          </ul>
          <SubmitButton>Save hours</SubmitButton>
        </ActionForm>
      )}

      <p className="muted text-[#66545d]">
        Once the week has ended, open each worker&apos;s timesheet from the <Link href="/team" className="font-semibold text-[#a4834e] underline underline-offset-2">team queue</Link>, submit it on their behalf, then approve it.
      </p>
    </div>
  );
}
