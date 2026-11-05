import { requireActor } from "@/server/auth/session";
import { auditTrail } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/** A04: who changed permissions, assignments or support access, when, and the affected account. */
export default async function AuditPage() {
  const actor = await requireActor();
  const rows = await auditTrail(actor, 300);
  return (
    <div data-page="admin-audit" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Audit log</h1>
        <p className="muted mt-1 text-[#66545d]">Latest 300 events. The log is append-only.</p>
      </div>
      <div className="overflow-x-auto rounded-[18px] border border-[#ded5c9] bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Affected</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="h-[90px] text-center text-sm text-[#66545d]">No audit events yet.</td></tr>
            )}
            {rows.map(({ a, actorName, targetName }) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                <td>{actorName ?? "System"}</td>
                <td className="font-mono text-xs text-[#92621e]">{a.action}</td>
                <td className="text-xs">{targetName ?? `${a.targetType}${a.targetId ? ` ${a.targetId.slice(0, 8)}` : ""}`}</td>
                <td className="max-w-md truncate font-mono text-xs text-[#66545d]" title={a.details ? JSON.stringify(a.details) : ""}>
                  {a.details ? JSON.stringify(a.details) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
