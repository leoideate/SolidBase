import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { managerQueue } from "@/server/services/views";
import { weekLabel } from "@/lib/time";
import { Empty, FlagBadge, Hours, Money, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof managerQueue>>["submitted"][number];

function Row({ s, showFlags = true }: { s: Item; showFlags?: boolean }) {
  return (
    <li>
      <Link href={`/team/timesheets/${s.ts.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-400">
        <div className="min-w-0">
          <div className="font-semibold">
            {s.name} <span className="text-xs font-normal text-slate-500">{s.workerCode}</span>
          </div>
          <div className="text-sm text-slate-600">{weekLabel(s.ts.weekStart)}</div>
          {showFlags && s.flags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {[...new Map(s.flags.map((f) => [f.code, f])).values()].map((f) => (
                <FlagBadge key={f.code} label={f.label} />
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <StatusBadge status={s.ts.status} />
          <div className="mt-1 text-sm font-semibold"><Hours s={s.seconds} /> h · <Money v={s.unpriced ? null : s.value} /></div>
        </div>
      </Link>
    </li>
  );
}

function Section({ title, hint, items, empty }: { title: string; hint?: string; items: Item[]; empty: string }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="h2">
          {title} <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs">{items.length}</span>
        </h2>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {items.length === 0 ? <Empty>{empty}</Empty> : <ul className="space-y-2">{items.map((s) => <Row key={s.ts.id} s={s} />)}</ul>}
    </section>
  );
}

/** In-app queue is the notification method in phase one (F12). */
export default async function TeamQueuePage() {
  const actor = await requireActor();
  if (!actor.isManager && !actor.isAdmin) redirect("/");
  const q = await managerQueue(actor);
  return (
    <div className="space-y-6">
      <PageHeader title="Team queue" subtitle={actor.isAdmin ? "All workers in the business" : "Only workers assigned to you"} actions={<Link href="/team/overview" className="btn-secondary">Team overview</Link>} />
      <Section title="Awaiting your approval" items={q.submitted} empty="Nothing to approve right now." />
      <Section title="Issues to resolve" hint="Missing clock-outs, long shifts, missing rates" items={q.issues} empty="No open issues." />
      <Section title="Not yet submitted" hint="Week ended, still in draft" items={q.overdue} empty="No overdue timesheets." />
      <Section title="Returned to worker" items={q.returned} empty="None waiting on workers." />
    </div>
  );
}
