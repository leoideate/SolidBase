import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { adminCounts } from "@/server/services/admin-views";
import { Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const actor = await requireActor();
  const c = await adminCounts(actor);
  return (
    <div data-page="admin-home" className="space-y-5">
      <div className="pb-1">
        <div className="mb-5 flex items-center gap-3 text-xs font-semibold tracking-wide text-[#a4834e]">
          <span aria-hidden="true" className="h-px w-10 bg-[#a4834e]" />
          ADMINISTRATION
        </div>
        <h1 className="h1">Administration</h1>
        <p className="muted mt-1 text-[#66545d]">Business setup, permissions and history</p>
      </div>
      <div className="admin-stats grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Active workers" value={String(c.workers)} />
        <Stat label="Managers" value={String(c.managers)} />
        <Stat label="Active projects" value={String(c.projects)} />
        <Stat label="Awaiting approval" value={String(c.submitted)} />
        <Stat label="Rate problems" value={String(c.problems)} tone={c.problems ? "default" : "muted"} sub={c.problems ? "Blocking approval" : "None"} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["/admin/users", "Users and access", "Create accounts, reset PINs, set roles, assign workers to managers, grant CostMaster."],
          ["/admin/projects", "Projects", "Clients, projects, addresses, SIN, project types and dates."],
          ["/admin/rates", "Rates", "Agreed hourly or day rates in EUR with effective dates and overrides."],
          ["/admin/import", "Import from CSV", "Bulk upload workers and previous weeks' hours, checked before anything is saved."],
          ["/admin/support", "IT support access", "Authorise and revoke time-limited support access."],
          ["/admin/settings", "Settings", "Long-shift flag threshold and manager CSV export."],
          ["/admin/audit", "Audit log", "Who changed permissions, assignments, rates and approvals."],
        ].map(([href, title, desc]) => (
          <Link key={href} href={href} className="block rounded-[18px] border border-[#ded5c9] bg-white p-4 transition-colors hover:border-[#c38e30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e] sm:p-5">
            <div className="h2">{title}</div>
            <p className="muted mt-1 text-[#66545d]">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
