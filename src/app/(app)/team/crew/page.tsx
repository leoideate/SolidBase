import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { listCrew } from "@/server/services/crew";
import { companyLookups } from "@/server/services/views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PersonFields } from "@/components/person-fields";
import { ENGAGEMENT_LABEL } from "@/lib/labels";
import { Empty, PageHeader } from "@/components/ui";
import { addCrewWorkerAction, crewAllocationsAction } from "../actions";

export const dynamic = "force-dynamic";

type Lookups = Awaited<ReturnType<typeof companyLookups>>;

function AllocationChecks({ lookups, projectIds = [], roleIds = [] }: { lookups: Lookups; projectIds?: string[]; roleIds?: string[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <fieldset className="space-y-1">
        <legend className="label">Roles</legend>
        {lookups.roles.filter((r) => r.isActive || roleIds.includes(r.id)).map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="jobRoleIds" value={r.id} defaultChecked={roleIds.includes(r.id)} className="size-4" />
            {r.name}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="label">Projects</legend>
        {lookups.projects.filter((p) => p.isActive || projectIds.includes(p.id)).map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="projectIds" value={p.id} defaultChecked={projectIds.includes(p.id)} className="size-4" />
            {p.code} · {p.name}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** Supervisor's crew: add workers and choose their roles and projects. Admin alone sets PINs. */
export default async function CrewPage() {
  const actor = await requireActor();
  if (!actor.isManager && !actor.isAdmin) redirect("/");
  const [crew, lookups] = await Promise.all([listCrew(actor), companyLookups(actor.companyId)]);
  const roleName = new Map(lookups.roles.map((r) => [r.id, r.name]));
  const projectCode = new Map(lookups.projects.map((p) => [p.id, p.code]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My crew"
        subtitle={actor.isAdmin ? "All workers in the business" : "Workers assigned to you"}
        actions={<Link href="/team/hours" className="btn-primary">Enter hours</Link>}
      />

      <section className="card">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-blue-700">+ Add a worker</summary>
          <ActionForm action={addCrewWorkerAction} className="mt-3 space-y-3" resetOnSuccess>
            <PersonFields />
            <AllocationChecks lookups={lookups} />
            <p className="muted">The worker can&apos;t log in yet. You enter their hours. If they should clock in on their own phone, ask admin to set a PIN.</p>
            <SubmitButton>Add worker</SubmitButton>
          </ActionForm>
        </details>
      </section>

      {crew.length === 0 ? (
        <Empty>No workers in your crew yet. Add one above.</Empty>
      ) : (
        <ul className="space-y-2">
          {crew.map((w) => (
            <li key={w.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {w.name} <span className="text-xs font-normal text-slate-500">{w.workerCode}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {w.roleIds.map((id) => roleName.get(id)).join(", ") || "No roles"} · {w.projectIds.map((id) => projectCode.get(id)).join(", ") || "No projects"}
                    {w.engagementType && <> · {ENGAGEMENT_LABEL[w.engagementType]}</>}
                    {w.mobile && <> · {w.mobile}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!w.isActive && <span className="badge bg-slate-200 text-slate-700">Deactivated</span>}
                  {w.hasPin ? (
                    <span className="badge bg-emerald-100 text-emerald-800">App access</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-900" title={`Admin can set a PIN for login name ${w.username}`}>No app login</span>
                  )}
                </div>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700 select-none">Change roles and projects</summary>
                <ActionForm action={crewAllocationsAction} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="hidden" name="workerId" value={w.id} />
                  <AllocationChecks lookups={lookups} projectIds={w.projectIds} roleIds={w.roleIds} />
                  <SubmitButton className="btn-primary btn-sm">Save</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
