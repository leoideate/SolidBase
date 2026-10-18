import { requireActor } from "@/server/auth/session";
import { hasCostAccess } from "@/server/services/costmaster";
import { dict } from "@/lib/i18n/en";
import { NavLinks } from "@/components/nav-links";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const t = dict("en");
  const links: { href: string; label: string }[] = [];
  if (actor.isWorker) links.push({ href: "/clock", label: t.nav.clock }, { href: "/timesheets", label: t.nav.myWeek }, { href: "/history", label: t.nav.history });
  if (actor.isManager || actor.isAdmin) links.push({ href: "/team", label: t.nav.team }, { href: "/team/hours", label: t.nav.crewHours }, { href: "/team/crew", label: t.nav.crew }, { href: "/team/overview", label: t.nav.overview });
  if (actor.isAdmin) links.push({ href: "/admin", label: t.nav.admin });
  if (await hasCostAccess(actor)) links.push({ href: "/costs", label: t.nav.costs });
  if (actor.isIt) links.push({ href: "/system", label: t.nav.system });

  const roles = [actor.isWorker && "Worker", actor.isManager && "Manager", actor.isAdmin && "Admin", actor.isIt && "IT"].filter(Boolean).join(" · ");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/solidbase-mark.svg" alt="SolidBase" className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{actor.displayName}</div>
              <div className="truncate text-xs text-slate-400">{roles || "CostMaster"}</div>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">{t.nav.logout}</button>
          </form>
        </div>
        <NavLinks links={links} />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
