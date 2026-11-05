import { requireActor } from "@/server/auth/session";
import { exportHistory } from "@/server/services/admin-views";
import { fmtDateTime } from "@/lib/time";
import { fmtMoney, hours } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Export history (ARD p.6). Repeating an export does not represent another payment. */
export default async function ExportHistoryPage() {
  const actor = await requireActor();
  const rows = await exportHistory(actor);
  return (
    <div data-page="admin-exports" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Export history</h1>
        <p className="muted mt-1 text-[#66545d]">Every CSV download is recorded with its filters and the approved entry versions it contained. Repeating an export is not another payment.</p>
      </div>
      {rows.length === 0 ? (
        <div className="flex min-h-[90px] items-center justify-center rounded-[18px] border border-[#ded5c9] bg-white p-6 text-center text-sm text-[#66545d]">No exports yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#ded5c9] bg-white">
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
                    <td><span className="badge bg-[#f2ebdf] text-[#92621e]">{e.scope}</span></td>
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
