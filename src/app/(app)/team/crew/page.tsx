import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { listCrew } from "@/server/services/crew";
import { companyLookups } from "@/server/services/views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NewRoleInput } from "@/components/role-checkboxes";
import { PersonFields } from "@/components/person-fields";
import { ENGAGEMENT_LABEL } from "@/lib/labels";
import { maskIban } from "@/lib/money";
import { addCrewWorkerAction, crewAllocationsAction, crewBankAction } from "../actions";

export const dynamic = "force-dynamic";

type Lookups = Awaited<ReturnType<typeof companyLookups>>;

function AllocationChecks({ lookups, projectIds = [], roleIds = [] }: { lookups: Lookups; projectIds?: string[]; roleIds?: string[] }) {
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <div className="min-w-0 space-y-4">
      <fieldset className="max-h-72 min-w-0 space-y-1 overflow-y-auto">
        <legend className="label">Roles (tick all that apply)</legend>
        {lookups.roles.filter((r) => r.isActive || roleIds.includes(r.id)).map((r) => (
          <label key={r.id} className="flex items-start gap-2 text-sm break-words">
            <input type="checkbox" name="jobRoleIds" value={r.id} defaultChecked={roleIds.includes(r.id)} className="mt-0.5 size-4 shrink-0 accent-[#a4834e]" />
            {r.name}
          </label>
        ))}
      </fieldset>
      <NewRoleInput />
      </div>
      <fieldset className="space-y-1">
        <legend className="label">Projects</legend>
        {lookups.projects.filter((p) => p.isActive || projectIds.includes(p.id)).map((p) => (
          <label key={p.id} className="flex items-start gap-2 text-sm break-words">
            <input type="checkbox" name="projectIds" value={p.id} defaultChecked={projectIds.includes(p.id)} className="mt-0.5 size-4 shrink-0 accent-[#a4834e]" />
            {p.code} · {p.name}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/**
 * Bank name and IBAN. A supervisor can record the first IBAN for a crew member; once saved it's
 * shown masked and only an administrator can change it.
 */
function BankFields({ required = false }: { required?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
      <div>
        <label className="label">Bank name{required ? "" : " (optional)"}</label>
        <input name="bankName" className="input" aria-label="Bank name" autoComplete="off" required={required} />
      </div>
      <div>
        <label className="label">IBAN{required ? "" : " (optional)"}</label>
        <input name="iban" className="input font-mono uppercase" aria-label="IBAN" placeholder="IE29 AIBK 9311 5212 3456 78" autoComplete="off" spellCheck={false} required={required} />
      </div>
      <p className="muted sm:col-span-2">Once saved, the IBAN is shown masked and only an administrator can change it.</p>
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
    <div data-page="my-crew" className="space-y-4">
      <div>
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          TEAM MANAGEMENT
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="h1">My crew</h1>
            <p className="muted mt-1 text-[#66545d]">{actor.isAdmin ? "All workers in the business" : "Workers assigned to you"}</p>
          </div>
          <Link href="/team/hours" className="btn-secondary border-[#a99576] bg-[#f2ebdf] px-6 hover:bg-[#e9ddca] focus-visible:outline-[#92754e]">Enter hours</Link>
        </div>
      </div>

      <section className="rounded-[18px] border border-[#ded5c9] bg-white px-4 py-3 sm:px-6">
        <details>
          <summary className="crew-summary cursor-pointer text-sm font-semibold text-[#a2650c]">Add a worker</summary>
          <ActionForm action={addCrewWorkerAction} className="mt-4 space-y-4 pb-2" resetOnSuccess>
            <PersonFields />
            <BankFields />
            <AllocationChecks lookups={lookups} />
            <p className="muted">The worker can&apos;t log in yet. You enter their hours. If they should clock in on their own phone, ask admin to set a PIN.</p>
            <SubmitButton className="btn-brand bg-[#b38323] text-white hover:bg-[#9a701c] focus-visible:outline-[#92754e]">Add worker</SubmitButton>
          </ActionForm>
        </details>
      </section>

      {crew.length === 0 ? (
        <div className="rounded-[18px] border border-[#ded5c9] bg-white/75 p-6 text-center text-sm text-[#66545d]">No workers in your crew yet. Add one above.</div>
      ) : (
        <ul className="space-y-2">
          {crew.map((w) => (
            <li key={w.id} className="rounded-[18px] border border-[#ded5c9] bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 break-words">
                  <div className="font-semibold">
                    {w.name} <span className="text-xs font-normal text-slate-500">{w.workerCode}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {w.roleIds.map((id) => roleName.get(id)).join(", ") || "No roles"} · {w.projectIds.map((id) => projectCode.get(id)).join(", ") || "No projects"}
                    {w.engagementType && <> · {ENGAGEMENT_LABEL[w.engagementType]}</>}
                    {w.mobile && <> · {w.mobile}</>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {w.ibanHint ? (
                      <>
                        {w.bankName} · <span className="font-mono">{maskIban(w.ibanHint)}</span>
                      </>
                    ) : (
                      "No IBAN recorded"
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!w.isActive && <span className="badge bg-slate-200 text-slate-700">Deactivated</span>}
                  {w.hasPin ? (
                    <span className="badge bg-emerald-100 text-emerald-800">App access</span>
                  ) : (
                    <span className="badge bg-[#fff3d5] px-3 text-[#925d10]" title={`Admin can set a PIN for login name ${w.username}`}>No app login</span>
                  )}
                </div>
              </div>
              {!w.ibanHint && (
                <details className="mt-2">
                  <summary className="crew-summary cursor-pointer text-xs font-semibold text-[#a2650c] select-none">Add IBAN</summary>
                  <ActionForm action={crewBankAction} className="mt-4 space-y-4 rounded-2xl border border-[#ded5c9] bg-[#faf8f5] p-4 sm:p-5">
                    <input type="hidden" name="workerId" value={w.id} />
                    <BankFields required />
                    <SubmitButton className="btn-brand btn-sm bg-[#b38323] text-white hover:bg-[#9a701c] focus-visible:outline-[#92754e]">Save IBAN</SubmitButton>
                  </ActionForm>
                </details>
              )}
              <details className="mt-2">
                <summary className="crew-summary cursor-pointer text-xs font-semibold text-[#a2650c] select-none">Change roles and projects</summary>
                <ActionForm action={crewAllocationsAction} className="mt-4 space-y-4 rounded-2xl border border-[#ded5c9] bg-[#faf8f5] p-4 sm:p-5">
                  <input type="hidden" name="workerId" value={w.id} />
                  <AllocationChecks lookups={lookups} projectIds={w.projectIds} roleIds={w.roleIds} />
                  <SubmitButton className="btn-brand btn-sm bg-[#b38323] text-white hover:bg-[#9a701c] focus-visible:outline-[#92754e]">Save</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
