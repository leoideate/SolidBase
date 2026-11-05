import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listMembers } from "@/server/services/admin-views";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createUserAction } from "../actions";
import { RoleCheckboxes } from "@/components/role-checkboxes";
import { PersonFields } from "@/components/person-fields";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireActor();
  const members = await listMembers(actor);
  return (
    <div data-page="admin-users" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Users</h1>
        <p className="muted mt-1 text-[#66545d]">Deactivating keeps all history. CostMaster is granted per user on the user page.</p>
      </div>
      <div className="overflow-x-auto rounded-[18px] border border-[#ded5c9] bg-white">
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
                  <Link className="font-medium text-[#92621e] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e]" href={`/admin/users/${m.id}`}>
                    {u.displayName}
                  </Link>
                </td>
                <td>{u.username}</td>
                <td>{m.workerCode}</td>
                <td className="text-xs">{[m.isWorker && "Worker", m.isManager && "Manager", m.isAdmin && "Admin", m.isIt && "IT"].filter(Boolean).join(", ") || "—"}</td>
                <td className="text-xs">
                  <span className={`inline-flex rounded-full px-2 py-0.5 ${m.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{m.isActive ? "Active" : "Deactivated"}</span>
                  {!u.hasPin ? <div className="mt-1 text-[#925d10]">No app login</div> : u.mustChangePin && m.isActive && <div className="mt-1 text-[#925d10]">Temporary PIN</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-6">
        <h2 className="h2 mb-4">Add user</h2>
        <ActionForm action={createUserAction} className="space-y-4" resetOnSuccess>
          <PersonFields />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-user-username">Username (login)</label>
              <input id="new-user-username" name="username" className="input" autoCapitalize="none" placeholder="e.g. john.smith" required />
            </div>
            <div>
              <label className="label" htmlFor="new-user-pin">Temporary 6-digit PIN</label>
              <input id="new-user-pin" name="pin" className="input" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="off" />
            </div>
          </div>
          <RoleCheckboxes />
          <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Create user</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
