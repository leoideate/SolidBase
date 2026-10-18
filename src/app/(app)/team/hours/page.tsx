import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { crewEntriesOn, crewTimesheetsFor, listCrew } from "@/server/services/crew";
import { companyLookups } from "@/server/services/views";
import { fmtDate, fmtTime, localDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
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
    <div className="space-y-4">
      <PageHeader
        title="Enter crew hours"
        subtitle="Record the hours your workers did on one project for one day."
        actions={<Link href="/team/crew" className="btn-secondary">My crew</Link>}
      />

      <form method="get" className="card grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="date">Day</label>
          <input id="date" type="date" name="date" className="input" defaultValue={date} max={today} required />
        </div>
        <div>
          <label className="label" htmlFor="project">Project</label>
          <select id="project" name="project" className="input" defaultValue={projectId} required>
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Show</button>
      </form>

      {crew.length === 0 ? (
        <Empty>
          No workers in your crew. <Link href="/team/crew" className="font-semibold text-blue-700">Add workers</Link> first.
        </Empty>
      ) : !projectId ? (
        <Empty>Choose a day and a project to start.</Empty>
      ) : (
        <ActionForm action={crewHoursAction} className="card space-y-3">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="projectId" value={projectId} />
          <p className="muted">
            {fmtDate(date)}. Tick each worker who worked, then check their role and times. An end time earlier than the start counts as the next morning.
          </p>
          <ul className="divide-y divide-slate-200">
            {crew.map((w) => {
              const roleIds = w.roleIds.length ? w.roleIds : lookups.roles.filter((r) => r.isActive).map((r) => r.id);
              const done = entries.filter((e) => e.workerId === w.id);
              const sheet = sheets.find((s) => s.workerId === w.id);
              return (
                <li key={w.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(10rem,1.5fr)_1.5fr_1fr_1fr] sm:items-center">
                  <input type="hidden" name="workerId" value={w.id} />
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name={`on_${w.id}`} className="mt-1 size-5" aria-label={`${w.name} worked`} disabled={sheet?.status === "approved"} />
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
                  <input type="time" name={`start_${w.id}`} className="input" defaultValue="07:00" aria-label={`${w.name} start`} />
                  <input type="time" name={`end_${w.id}`} className="input" defaultValue="15:30" aria-label={`${w.name} end`} />
                </li>
              );
            })}
          </ul>
          <SubmitButton>Save hours</SubmitButton>
        </ActionForm>
      )}

      <p className="muted">
        Once the week has ended, open each worker&apos;s timesheet from the <Link href="/team" className="font-semibold text-blue-700">team queue</Link>, submit it on their behalf, then approve it.
      </p>
    </div>
  );
}
