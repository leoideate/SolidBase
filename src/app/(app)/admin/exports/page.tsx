import { requireActor } from "@/server/auth/session";
import { exportHistory } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Export history (ARD p.6). Repeating an export does not represent another payment. */
export default async function ExportHistoryPage() {
  const actor = await requireActor();
  const rows = await exportHistory(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Export history" subtitle="Every CSV download is recorded with its filters and the approved entry versions it contained. Repeating an export is not another payment." />
      {rows.length === 0 ? (
        <Empty>No exports yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Scope</th>
                <th>Period</th>
                <th className="num">Rows</th>
                <th className="num">Hours</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, name }) => {
                const f = e.filters as { fromWeek?: string; toWeek?: string };
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                    <td>{name}</td>
                    <td>{e.scope}</td>
                    <td className="whitespace-nowrap">{f.fromWeek} → {f.toWeek}</td>
                    <td className="num">{e.rowCount}</td>
                    <td className="num">{hours(e.totalSeconds)}</td>
                    <td className="num">{fmtMoney(e.totalValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
