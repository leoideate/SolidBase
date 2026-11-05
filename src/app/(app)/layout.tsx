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
      <header className="sticky top-0 z-20 border-b border-[#eee9e2] bg-white text-slate-950">
        <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:gap-x-8 xl:py-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/solidbase-logo.svg" alt="Solid Base Limited" width={110} height={60} className="h-12 w-[88px] shrink-0 object-contain xl:h-[60px] xl:w-[110px]" />
            <div className="min-w-0 border-l border-[#e5dbce] py-1 pl-4 sm:pl-7 xl:w-36">
              <div className="truncate text-sm font-semibold">{actor.displayName}</div>
              <div className="mt-1 truncate text-xs text-[#66545d]">{roles || "CostMaster"}</div>
            </div>
          </div>
          <NavLinks links={links} />
          <form action={logoutAction} className="col-start-2 row-start-1 justify-self-end xl:col-start-3">
            <button className="min-h-11 rounded-xl px-3 py-2 text-sm text-slate-950 transition-colors hover:bg-[#f5f1eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e]">{t.nav.logout}</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
