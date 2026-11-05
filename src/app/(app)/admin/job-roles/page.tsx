import { asc, eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { STANDARD_ROLES } from "@/server/role-catalogue";
import { loadStandardRolesAction, saveRoleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function JobRolesPage() {
  const actor = await requireActor();
  const roles = await db.select().from(schema.jobRoles).where(eq(schema.jobRoles.companyId, actor.companyId)).orderBy(asc(schema.jobRoles.name));
  return (
    <div data-page="admin-roles" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Roles</h1>
        <p className="muted mt-1 text-[#66545d]">Work roles a worker selects when clocking in. Set their hourly rates on the Rates page.</p>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <p className="muted max-w-prose text-[#66545d]">Add the {STANDARD_ROLES.length} standard construction roles (labourers, plant operators, trades, supervision, engineering, commercial). Roles you already have are left alone.</p>
        <ActionForm action={loadStandardRolesAction}>
          <SubmitButton className="btn-secondary border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Load standard roles</SubmitButton>
        </ActionForm>
      </section>
      <div className="space-y-2">
        {roles.map((r) => (
          <ActionForm key={r.id} action={saveRoleAction} className="grid gap-3 rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto_auto] sm:items-center sm:p-5">
            <input type="hidden" name="id" value={r.id} />
            <input name="code" className="input font-semibold" defaultValue={r.code} aria-label="Code" required />
            <input name="name" className="input" defaultValue={r.name} aria-label="Name" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={r.isActive} className="size-4 shrink-0 accent-[#a4834e]" /> Active
            </label>
            <SubmitButton className="btn-secondary btn-sm border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Save</SubmitButton>
          </ActionForm>
        ))}
      </div>
      <section className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <h2 className="h2 mb-4">Add role</h2>
        <ActionForm action={saveRoleAction} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]" resetOnSuccess>
          <input name="code" className="input" aria-label="New role code" placeholder="EXC" required />
          <input name="name" className="input" aria-label="New role name" placeholder="e.g. Excavator operator" required />
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Add</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
