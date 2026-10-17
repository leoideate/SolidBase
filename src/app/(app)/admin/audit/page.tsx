import { requireActor } from "@/server/auth/session";
import { auditTrail } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** A04: who changed permissions, assignments or support access, when, and the affected account. */
export default async function AuditPage() {
  const actor = await requireActor();
  const rows = await auditTrail(actor, 300);
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" subtitle="Latest 300 events. The log is append-only." />
      <div className="card overflow-x-auto p-0 sm:p-0">
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
            {rows.map(({ a, actorName, targetName }) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                <td>{actorName ?? "System"}</td>
                <td className="font-mono text-xs">{a.action}</td>
                <td className="text-xs">{targetName ?? `${a.targetType}${a.targetId ? ` ${a.targetId.slice(0, 8)}` : ""}`}</td>
                <td className="max-w-md truncate font-mono text-xs text-slate-500" title={a.details ? JSON.stringify(a.details) : ""}>
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
