import { requireActor } from "@/server/auth/session";
import { listMembers, listSupportGrants } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, PageHeader } from "@/components/ui";
import { grantSupportAction, revokeSupportAction } from "../actions";

export const dynamic = "force-dynamic";

/** A05: admin authorises and records support access, scope and revocation. */
export default async function SupportAccessPage() {
  const actor = await requireActor();
  const [grants, members] = await Promise.all([listSupportGrants(actor), listMembers(actor)]);
  const itUsers = members.filter((x) => x.m.isIt && x.m.isActive);
  const now = new Date();
  return (
    <div className="space-y-4">
      <PageHeader title="IT support access" subtitle="IT has no access to worker or financial records unless you grant it here. Access is read-only, time-limited and recorded." />
      <section className="card">
        <h2 className="h2 mb-3">Grant temporary access</h2>
        {itUsers.length === 0 ? (
          <p className="muted">No active users with the IT role.</p>
        ) : (
          <ActionForm action={grantSupportAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_8rem_auto] sm:items-end" resetOnSuccess>
            <div>
              <label className="label">IT user</label>
              <select name="itMemberId" className="input" required>
                {itUsers.map((x) => (
                  <option key={x.m.id} value={x.m.id}>{x.u.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reason / ticket</label>
              <input name="reason" className="input" placeholder="e.g. Investigating missing entries, ticket 123" required />
            </div>
            <div>
              <label className="label">Hours</label>
              <input name="hours" type="number" min={1} max={168} defaultValue={4} className="input" required />
            </div>
            <SubmitButton>Grant</SubmitButton>
          </ActionForm>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="h2">History</h2>
        {grants.length === 0 ? (
          <Empty>No support access has been granted.</Empty>
        ) : (
          <ul className="space-y-2">
            {grants.map(({ g, itName, grantedByName }) => {
              const active = !g.revokedAt && g.expiresAt > now;
              return (
                <li key={g.id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <div className="font-semibold">
                      {itName} {active ? <span className="badge bg-emerald-100 text-emerald-800">Active</span> : <span className="badge bg-slate-100 text-slate-600">{g.revokedAt ? "Revoked" : "Expired"}</span>}
                    </div>
                    <div className="text-xs text-slate-500">
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
