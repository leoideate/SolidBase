import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listMembers } from "@/server/services/admin-views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { createUserAction } from "../actions";
import { RoleCheckboxes } from "@/components/role-checkboxes";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireActor();
  const members = await listMembers(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle="Deactivating keeps all history. CostMaster is granted per user on the user page." />
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Worker ID</th>
              <th>Roles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map(({ m, u }) => (
              <tr key={m.id} className={m.isActive ? "" : "opacity-50"}>
                <td>
                  <Link className="font-medium text-blue-700 hover:underline" href={`/admin/users/${m.id}`}>
                    {u.displayName}
                  </Link>
                </td>
                <td>{u.username}</td>
                <td>{m.workerCode}</td>
                <td className="text-xs">{[m.isWorker && "Worker", m.isManager && "Manager", m.isAdmin && "Admin", m.isIt && "IT"].filter(Boolean).join(", ") || "—"}</td>
                <td className="text-xs">
                  {m.isActive ? "Active" : "Deactivated"}
                  {!u.hasPin ? <div className="text-amber-700">No app login</div> : u.mustChangePin && m.isActive && <div className="text-amber-700">Temporary PIN</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2 className="h2 mb-3">Add user</h2>
        <ActionForm action={createUserAction} className="space-y-3" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input name="displayName" className="input" required />
            </div>
            <div>
              <label className="label">Worker ID (stable)</label>
              <input name="workerCode" className="input" placeholder="e.g. W004" required />
            </div>
            <div>
              <label className="label">Username (login)</label>
              <input name="username" className="input" autoCapitalize="none" placeholder="e.g. john.smith" required />
            </div>
            <div>
              <label className="label">Temporary 6-digit PIN</label>
              <input name="pin" className="input" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="off" />
            </div>
          </div>
          <RoleCheckboxes />
          <SubmitButton>Create user</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
