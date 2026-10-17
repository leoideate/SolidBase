import { asc, eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { saveProjectAction } from "../actions";

export const dynamic = "force-dynamic";

/** F03: unique internal project code, name, optional site reference, active status. */
export default async function ProjectsPage() {
  const actor = await requireActor();
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.companyId, actor.companyId)).orderBy(asc(schema.projects.code));
  return (
    <div className="space-y-4">
      <PageHeader title="Projects" subtitle="Making a project inactive hides it from clocking but keeps all historical allocations." />
      <div className="space-y-2">
        {projects.map((p) => (
          <ActionForm key={p.id} action={saveProjectAction} className="card grid gap-2 sm:grid-cols-[7rem_1fr_10rem_auto_auto] sm:items-center">
            <input type="hidden" name="id" value={p.id} />
            <input name="code" className="input font-semibold" defaultValue={p.code} aria-label="Code" required />
            <input name="name" className="input" defaultValue={p.name} aria-label="Name" required />
            <input name="siteRef" className="input" defaultValue={p.siteRef ?? ""} placeholder="Site ref" aria-label="Site reference" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={p.isActive} className="size-4" /> Active
            </label>
            <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
          </ActionForm>
        ))}
      </div>
      <section className="card">
        <h2 className="h2 mb-3">Add project</h2>
        <ActionForm action={saveProjectAction} className="grid gap-2 sm:grid-cols-[7rem_1fr_10rem_auto]" resetOnSuccess>
          <input name="code" className="input" placeholder="P004" required />
          <input name="name" className="input" placeholder="Project name" required />
          <input name="siteRef" className="input" placeholder="Site ref (optional)" />
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
