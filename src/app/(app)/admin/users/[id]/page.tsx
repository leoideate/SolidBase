import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { listMembers, memberDetail } from "@/server/services/admin-views";
import { companyLookups } from "@/server/services/views";
import { AppError } from "@/server/errors";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { RoleCheckboxes } from "@/components/role-checkboxes";
import { PersonFields } from "@/components/person-fields";
import {
  allocationsAction,
  assignManagerAction,
  grantCostAction,
  resetPinAction,
  revokeCostAction,
  setActiveAction,
  unassignManagerAction,
  updateUserAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await requireActor();
  let d;
  try {
    d = await memberDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { projects, roles } = await companyLookups(actor.companyId);
  const all = await listMembers(actor);
  const managers = all.filter((x) => x.m.isManager && x.m.isActive && x.m.id !== id);
  const workers = all.filter((x) => x.m.isWorker && x.m.isActive && x.m.id !== id);
  const { m, u } = d;

  return (
    <div className="space-y-4">
      <PageHeader
        title={u.displayName}
        subtitle={`${u.username} · ${m.workerCode} · ${m.isActive ? "Active" : "Deactivated"}`}
        actions={<Link href="/admin/users" className="btn-secondary">All users</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Worker details and access roles</h2>
          <ActionForm action={updateUserAction} className="space-y-3">
            <input type="hidden" name="memberId" value={m.id} />
            <PersonFields p={{ ...u, engagementType: m.engagementType }} workerCode={m.workerCode} autoCode={false} />
            <RoleCheckboxes d={m} />
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </section>

        <section className="card space-y-4">
          <div>
            <h2 className="h2 mb-2">{u.pinHash ? "Reset PIN" : "Set PIN (gives app access)"}</h2>
            {!u.pinHash && <p className="muted mb-2">Added by a supervisor, with no app login yet. After you set a PIN, give the worker their login name <strong>{u.username}</strong> and the temporary PIN.</p>}
            <ActionForm action={resetPinAction} className="flex flex-col gap-2 sm:flex-row" resetOnSuccess>
              <input type="hidden" name="memberId" value={m.id} />
              <input name="pin" className="input flex-1" placeholder="New temporary 6-digit PIN" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="off" />
              <SubmitButton className="btn-secondary">{u.pinHash ? "Reset PIN" : "Set PIN"}</SubmitButton>
            </ActionForm>
          </div>
          <div className="border-t border-slate-200 pt-4">
            <h2 className="h2 mb-2">{m.isActive ? "Deactivate account" : "Reactivate account"}</h2>
            <p className="muted mb-2">{m.isActive ? "Stops new logins immediately. Records and history are kept." : "Allows this user to log in again."}</p>
            <ActionForm action={setActiveAction} confirm={m.isActive ? `Deactivate ${u.displayName}?` : undefined}>
              <input type="hidden" name="memberId" value={m.id} />
              <input type="hidden" name="active" value={m.isActive ? "false" : "true"} />
              <SubmitButton className={m.isActive ? "btn-danger" : "btn-secondary"}>{m.isActive ? "Deactivate" : "Reactivate"}</SubmitButton>
            </ActionForm>
          </div>
        </section>
      </div>

      {m.isWorker && (
        <section className="card">
          <h2 className="h2 mb-1">Projects and roles this worker can clock against</h2>
          <p className="muted mb-3">Inactive projects and roles are hidden from the clock screen automatically.</p>
          <ActionForm action={allocationsAction} className="space-y-3">
            <input type="hidden" name="memberId" value={m.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <fieldset className="space-y-1">
                <legend className="label">Projects</legend>
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="projectIds" value={p.id} defaultChecked={d.projectIds.includes(p.id)} className="size-4" />
                    {p.code} · {p.name} {!p.isActive && <span className="text-xs text-slate-400">(inactive)</span>}
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-1">
                <legend className="label">Roles</legend>
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="jobRoleIds" value={r.id} defaultChecked={d.roleIds.includes(r.id)} className="size-4" />
                    {r.name} {!r.isActive && <span className="text-xs text-slate-400">(inactive)</span>}
                  </label>
                ))}
              </fieldset>
            </div>
            <SubmitButton>Save allocations</SubmitButton>
          </ActionForm>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {m.isWorker && (
          <section className="card space-y-3">
            <h2 className="h2">Managers reviewing this worker</h2>
            <ul className="space-y-2">
              {d.managers.length === 0 && <li className="muted">No manager assigned. Nobody can approve this worker&apos;s hours except admin.</li>}
              {d.managers.map(({ a, name }) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    {name} <span className="text-xs text-slate-500">({a.kind})</span>
                  </span>
                  <ActionForm action={unassignManagerAction}>
                    <input type="hidden" name="managerId" value={a.managerId} />
                    <input type="hidden" name="workerId" value={m.id} />
                    <SubmitButton className="btn-secondary btn-sm">Remove</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
            <ActionForm action={assignManagerAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="workerId" value={m.id} />
              <select name="managerId" className="input flex-1" required>
                <option value="">Choose manager…</option>
                {managers.map((x) => (
                  <option key={x.m.id} value={x.m.id}>{x.u.displayName}</option>
                ))}
              </select>
              <select name="kind" className="input sm:w-36">
                <option value="primary">Primary</option>
                <option value="cover">Cover</option>
              </select>
              <SubmitButton className="btn-secondary">Assign</SubmitButton>
            </ActionForm>
          </section>
        )}

        {m.isManager && (
          <section className="card space-y-3">
            <h2 className="h2">Workers assigned to this manager</h2>
            <ul className="space-y-2">
              {d.team.length === 0 && <li className="muted">No workers assigned.</li>}
              {d.team.map(({ a, name }) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    {name} <span className="text-xs text-slate-500">({a.kind})</span>
                  </span>
                  <ActionForm action={unassignManagerAction}>
                    <input type="hidden" name="managerId" value={m.id} />
                    <input type="hidden" name="workerId" value={a.workerId} />
                    <SubmitButton className="btn-secondary btn-sm">Remove</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
            <ActionForm action={assignManagerAction} className="flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="managerId" value={m.id} />
              <select name="workerId" className="input flex-1" required>
                <option value="">Choose worker…</option>
                {workers.map((x) => (
                  <option key={x.m.id} value={x.m.id}>{x.u.displayName}</option>
                ))}
              </select>
              <select name="kind" className="input sm:w-36">
                <option value="primary">Primary</option>
                <option value="cover">Cover</option>
              </select>
              <SubmitButton className="btn-secondary">Assign</SubmitButton>
            </ActionForm>
          </section>
        )}

        <section className="card space-y-3">
          <h2 className="h2">CostMaster access</h2>
          <p className="muted">Read-only approved labour reporting. It does not allow approving hours or changing rates.</p>
          <ul className="space-y-2">
            {d.costGrants.length === 0 && <li className="muted">No CostMaster access.</li>}
            {d.costGrants.map(({ g, projectCode }) => (
              <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>
                  {projectCode ?? "All projects"} {g.canExport && <span className="badge bg-blue-100 text-blue-800">Export</span>}
                </span>
                <ActionForm action={revokeCostAction}>
                  <input type="hidden" name="grantId" value={g.id} />
                  <SubmitButton className="btn-secondary btn-sm">Remove</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={grantCostAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="hidden" name="memberId" value={m.id} />
            <select name="projectId" className="input flex-1">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <input type="checkbox" name="canExport" className="size-4" /> Can export
            </label>
            <SubmitButton className="btn-secondary">Grant</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
