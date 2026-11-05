import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { workerHistory } from "@/server/services/views";
import { weekLabel } from "@/lib/time";
import { Hours, Money, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const actor = await requireActor();
  if (!actor.isWorker) redirect("/");
  const weeks = await workerHistory(actor, actor.memberId);
  const approved = weeks.filter((w) => w.status === "approved");
  return (
    <div data-page="worker-history" className="space-y-5">
      <PageHeader title="History" subtitle="Your weekly timesheets. Approved values are before deductions." />
      {weeks.length === 0 ? (
        <div className="flex min-h-[90px] items-center justify-center rounded-[18px] border border-[#ded5c9] bg-white p-6 text-center text-sm text-[#66545d]">No timesheets yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[#ded5c9] bg-white">
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
                    <Link className="font-medium text-[#92621e] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e]" href={`/timesheets/${w.weekStart}`}>
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
