import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { clockOptions, getOpenEntry } from "@/server/services/clock";
import { totals, workerWeek } from "@/server/services/views";
import { weekLabel, weekStartOf } from "@/lib/time";
import { hours, fmtMoney } from "@/lib/money";
import { dict } from "@/lib/i18n/en";
import { ClockPanel } from "./clock-panel";

export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const actor = await requireActor();
  if (!actor.isWorker) redirect("/");
  const t = dict("en");
  const [open, options] = await Promise.all([getOpenEntry(actor), clockOptions(actor)]);
  let openInfo = null;
  if (open) {
    const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, open.projectId));
    const [r] = await db.select().from(schema.jobRoles).where(and(eq(schema.jobRoles.id, open.jobRoleId)));
    openInfo = { id: open.id, startAt: open.startAt.toISOString(), project: `${p.code} · ${p.name}`, role: r.name };
  }
  const week = weekStartOf(new Date());
  const view = await workerWeek(actor, actor.memberId, week);
  const tot = totals(view.entries);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <ClockPanel open={openInfo} projects={options.projects} roles={options.roles} t={t.clock} />
      <Link href="/timesheets" className="card block hover:border-brand-400">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">This week</div>
            <div className="text-sm text-slate-600">{weekLabel(week)}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums">{hours(tot.seconds)} h</div>
            <div className="text-xs text-slate-500">recorded · {fmtMoney(tot.value)} est. (unapproved)</div>
          </div>
        </div>
      </Link>
      <p className="px-1 text-xs text-slate-500">
        {t.clock.breakHint} {t.clock.changeHint}
      </p>
    </div>
  );
}
