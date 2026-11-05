import { asc, eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { DatePicker } from "@/components/date-picker";
import { localDate } from "@/lib/time";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveClientAction, saveProjectAction } from "../actions";

export const dynamic = "force-dynamic";

type Project = typeof schema.projects.$inferSelect;
type Client = typeof schema.clients.$inferSelect;

function ProjectFields({ p, clients }: { p?: Project; clients: Client[] }) {
  const today = localDate(new Date());
  const prefix = `project-${p?.id ?? "new"}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="label">Client name</label>
        <select name="clientId" className="input" defaultValue={p?.clientId ?? ""}>
          <option value="">Choose…</option>
          {clients.filter((c) => c.isActive || c.id === p?.clientId).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Principal</label>
        <input name="principal" className="input" defaultValue={p?.principal ?? ""} />
      </div>
      <div>
        <label className="label">Project type</label>
        <select name="projectType" className="input" defaultValue={p?.projectType ?? ""}>
          <option value="">Choose…</option>
          {Object.entries(PROJECT_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Project ID</label>
        <input name="code" className="input font-semibold" defaultValue={p?.code} placeholder="e.g. P004" required />
      </div>
      <div className="lg:col-span-2">
        <label className="label">Project name</label>
        <input name="name" className="input" defaultValue={p?.name} required />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="label">Project description</label>
        <textarea name="description" className="input min-h-16" defaultValue={p?.description ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Location (full address)</label>
        <input name="address" className="input" defaultValue={p?.address ?? ""} />
      </div>
      <div>
        <label className="label">SIN (Site Identification Number)</label>
        <input name="siteRef" className="input" defaultValue={p?.siteRef ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-startDate`}>Start date</label>
        <DatePicker id={`${prefix}-startDate`} name="startDate" defaultValue={p?.startDate ?? ""} today={today} required={false} />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-endDate`}>End date</label>
        <DatePicker id={`${prefix}-endDate`} name="endDate" defaultValue={p?.endDate ?? ""} today={today} required={false} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={p ? p.isActive : true} className="size-4" /> Active (workers can be booked to it)
      </label>
    </div>
  );
}

/** F03 plus the client's project fields: client, principal, type, description, address, SIN, dates. */
export default async function ProjectsPage() {
  const actor = await requireActor();
  const [projects, clients] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.companyId, actor.companyId)).orderBy(asc(schema.projects.code)),
    db.select().from(schema.clients).where(eq(schema.clients.companyId, actor.companyId)).orderBy(asc(schema.clients.name)),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <div data-page="admin-projects" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Projects</h1>
        <p className="muted mt-1 text-[#66545d]">Working hours are always booked to a project. Making a project inactive hides it from clocking and crew hours but keeps its history.</p>
      </div>

      <section className="space-y-2">
        {projects.length === 0 && <div className="rounded-[18px] border border-[#ded5c9] bg-white p-6 text-center text-sm text-[#66545d]">No projects yet. Add the first one below.</div>}
        {projects.map((p) => (
          <details key={p.id} className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
            <summary className="project-summary flex cursor-pointer flex-wrap items-baseline justify-between gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#92754e]">
              <span>
                <span className="font-semibold">{p.code}</span> · {p.name}
                {!p.isActive && <span className="ml-2 badge bg-slate-200 text-slate-700">Inactive</span>}
              </span>
              <span className="text-xs text-slate-500">
                {[p.clientId && clientName.get(p.clientId), p.projectType && PROJECT_TYPE_LABEL[p.projectType], p.siteRef && `SIN ${p.siteRef}`].filter(Boolean).join(" · ")}
              </span>
            </summary>
            <ActionForm action={saveProjectAction} className="mt-4 space-y-4 border-t border-[#ded5c9] pt-4">
              <input type="hidden" name="id" value={p.id} />
              <ProjectFields p={p} clients={clients} />
              <SubmitButton className="btn-secondary border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Save project</SubmitButton>
            </ActionForm>
          </details>
        ))}
      </section>

      <section className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <h2 className="h2 mb-4">Add project</h2>
        <ActionForm action={saveProjectAction} className="space-y-4" resetOnSuccess>
          <ProjectFields clients={clients} />
          <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Add project</SubmitButton>
        </ActionForm>
      </section>

      <section className="space-y-4 rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <div>
          <h2 className="h2">Clients</h2>
          <p className="muted text-[#66545d]">The list you pick from when setting up a project.</p>
        </div>
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id}>
              <ActionForm action={saveClientAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" className="input min-w-0 basis-48 flex-1" defaultValue={c.name} aria-label="Client name" required />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={c.isActive} className="size-4" /> Active
                </label>
                <SubmitButton className="btn-secondary btn-sm border-[#b88340] bg-[#fcf5e9]! hover:bg-[#f2e6d3]! focus-visible:outline-[#92754e]">Save</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveClientAction} className="flex flex-wrap gap-2 border-t border-[#ded5c9] pt-3" resetOnSuccess>
          <input name="name" className="input min-w-0 basis-48 flex-1" placeholder="New client name" aria-label="New client name" required />
          <input type="hidden" name="isActive" value="on" />
          <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Add client</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
