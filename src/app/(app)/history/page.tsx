import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { workerHistory } from "@/server/services/views";
import { weekLabel } from "@/lib/time";
import { Empty, Hours, Money, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const actor = await requireActor();
  if (!actor.isWorker) redirect("/");
  const weeks = await workerHistory(actor, actor.memberId);
  const approved = weeks.filter((w) => w.status === "approved");
  return (
    <div className="space-y-4">
      <PageHeader title="History" subtitle="Your weekly timesheets. Approved values are before deductions." />
      {weeks.length === 0 ? (
        <Empty>No timesheets yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0 sm:p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Status</th>
                <th className="num">Hours</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link className="font-medium text-blue-700 underline-offset-2 hover:underline" href={`/timesheets/${w.weekStart}`}>
                      {weekLabel(w.weekStart)}
                    </Link>
                  </td>
                  <td><StatusBadge status={w.status} /></td>
                  <td className="num"><Hours s={w.seconds} /></td>
                  <td className="num">{w.status === "approved" ? <Money v={w.value} /> : <span className="text-slate-400">pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {approved.length > 0 && <p className="muted">{approved.length} approved week(s).</p>}
    </div>
  );
}
