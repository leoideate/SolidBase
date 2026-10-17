import { asc, eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { saveRoleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function JobRolesPage() {
  const actor = await requireActor();
  const roles = await db.select().from(schema.jobRoles).where(eq(schema.jobRoles.companyId, actor.companyId)).orderBy(asc(schema.jobRoles.name));
  return (
    <div className="space-y-4">
      <PageHeader title="Roles" subtitle="Work roles a worker selects when clocking in. Set their hourly rates on the Rates page." />
      <div className="space-y-2">
        {roles.map((r) => (
          <ActionForm key={r.id} action={saveRoleAction} className="card grid gap-2 sm:grid-cols-[7rem_1fr_auto_auto] sm:items-center">
            <input type="hidden" name="id" value={r.id} />
            <input name="code" className="input font-semibold" defaultValue={r.code} aria-label="Code" required />
            <input name="name" className="input" defaultValue={r.name} aria-label="Name" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={r.isActive} className="size-4" /> Active
            </label>
            <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
          </ActionForm>
        ))}
      </div>
      <section className="card">
        <h2 className="h2 mb-3">Add role</h2>
        <ActionForm action={saveRoleAction} className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]" resetOnSuccess>
          <input name="code" className="input" placeholder="EXC" required />
          <input name="name" className="input" placeholder="e.g. Excavator operator" required />
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
