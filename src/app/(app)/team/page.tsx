import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { managerQueue } from "@/server/services/views";
import { weekLabel } from "@/lib/time";
import { FlagBadge, Hours, Money, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Item = Awaited<ReturnType<typeof managerQueue>>["submitted"][number];

function Row({ s, showFlags = true }: { s: Item; showFlags?: boolean }) {
  return (
    <li>
      <Link href={`/team/timesheets/${s.ts.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5dbce] bg-white p-3 transition-colors hover:border-[#b59a72] hover:bg-[#faf8f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e]">
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
    <section className="min-h-[124px] rounded-[20px] border border-[#d9cfc1] bg-white/75 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="h2 flex items-baseline gap-4">
          {title} <span className="text-xs tabular-nums">{items.length}</span>
        </h2>
        {hint && <span className="text-xs text-[#66545d]">{hint}</span>}
      </div>
      {items.length === 0 ? (
        <div className="flex min-h-16 items-center justify-center py-3 text-center text-sm text-[#66545d]">{empty}</div>
      ) : (
        <ul className="mt-4 space-y-2">{items.map((s) => <Row key={s.ts.id} s={s} />)}</ul>
      )}
    </section>
  );
}

/** In-app queue is the notification method in phase one (F12). */
export default async function TeamQueuePage() {
  const actor = await requireActor();
  if (!actor.isManager && !actor.isAdmin) redirect("/");
  const q = await managerQueue(actor);
  return (
    <div data-page="team-queue" className="space-y-6">
      <div className="pb-2 sm:pb-3">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          TEAM MANAGEMENT
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="h1">Team queue</h1>
            <p className="muted mt-1 text-[#66545d]">{actor.isAdmin ? "All workers in the business" : "Only workers assigned to you"}</p>
          </div>
          <Link href="/team/overview" className="btn-secondary border-[#a99576] bg-[#f2ebdf] px-6 hover:bg-[#e9ddca] focus-visible:outline-[#92754e]">Team overview</Link>
        </div>
      </div>
      <Section title="Awaiting your approval" items={q.submitted} empty="Nothing to approve right now." />
      <Section title="Issues to resolve" hint="Missing clock-outs, long shifts, missing rates" items={q.issues} empty="No open issues." />
      <Section title="Not yet submitted" hint="Week ended, still in draft" items={q.overdue} empty="No overdue timesheets." />
      <Section title="Returned to worker" items={q.returned} empty="None waiting on workers." />
    </div>
  );
}
