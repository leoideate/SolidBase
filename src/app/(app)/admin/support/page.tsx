import { requireActor } from "@/server/auth/session";
import { listMembers, listSupportGrants } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { grantSupportAction, revokeSupportAction } from "../actions";

export const dynamic = "force-dynamic";

/** A05: admin authorises and records support access, scope and revocation. */
export default async function SupportAccessPage() {
  const actor = await requireActor();
  const [grants, members] = await Promise.all([listSupportGrants(actor), listMembers(actor)]);
  const itUsers = members.filter((x) => x.m.isIt && x.m.isActive);
  const now = new Date();
  return (
    <div data-page="admin-support" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">IT support access</h1>
        <p className="muted mt-1 text-[#66545d]">IT has no access to worker or financial records unless you grant it here. Access is read-only, time-limited and recorded.</p>
      </div>
      <section className="rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <h2 className="h2 mb-4">Grant temporary access</h2>
        {itUsers.length === 0 ? (
          <p className="muted text-[#66545d]">No active users with the IT role.</p>
        ) : (
          <ActionForm action={grantSupportAction} className="support-grant-form grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7rem_auto] lg:items-end" resetOnSuccess>
            <div>
              <label className="label" htmlFor="support-itMemberId">IT user</label>
              <select id="support-itMemberId" name="itMemberId" className="input" required>
                {itUsers.map((x) => (
                  <option key={x.m.id} value={x.m.id}>{x.u.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="support-reason">Reason / ticket</label>
              <input id="support-reason" name="reason" className="input" placeholder="e.g. Investigating missing entries, ticket 123" required />
            </div>
            <div>
              <label className="label" htmlFor="support-hours">Hours</label>
              <input id="support-hours" name="hours" type="number" min={1} max={168} defaultValue={4} className="input" required />
            </div>
            <SubmitButton className="btn-brand bg-[#b38323]! text-white hover:bg-[#9a701c]! focus-visible:outline-[#92754e]">Grant</SubmitButton>
          </ActionForm>
        )}
      </section>
      <section className="space-y-4 rounded-[18px] border border-[#ded5c9] bg-white p-4 sm:p-5">
        <h2 className="h2">History</h2>
        {grants.length === 0 ? (
          <div className="flex min-h-20 items-center justify-center py-4 text-center text-sm text-[#66545d]">No support access has been granted.</div>
        ) : (
          <ul className="space-y-2">
            {grants.map(({ g, itName, grantedByName }) => {
              const active = !g.revokedAt && g.expiresAt > now;
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ded5c9] p-4 text-sm">
                  <div className="min-w-0 break-words">
                    <div className="font-semibold">
                      {itName} {active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-100 text-slate-600">{g.revokedAt ? "Revoked" : "Expired"}</span>}
                    </div>
                    <div className="mt-1 text-xs text-[#66545d]">
                      “{g.reason}” · granted by {grantedByName} {fmtDateTime(g.grantedAt)} · expires {fmtDateTime(g.expiresAt)}
                      {g.revokedAt && <> · revoked {fmtDateTime(g.revokedAt)}</>}
                    </div>
                  </div>
                  {active && (
                    <ActionForm action={revokeSupportAction}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <SubmitButton className="btn-danger btn-sm">Revoke now</SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
