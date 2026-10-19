import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { adminCounts } from "@/server/services/admin-views";
import { PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const actor = await requireActor();
  const c = await adminCounts(actor);
  return (
    <div className="space-y-4">
      <PageHeader title="Administration" subtitle="Business setup, permissions and history" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Active workers" value={String(c.workers)} />
        <Stat label="Managers" value={String(c.managers)} />
        <Stat label="Active projects" value={String(c.projects)} />
        <Stat label="Awaiting approval" value={String(c.submitted)} />
        <Stat label="Rate problems" value={String(c.problems)} tone={c.problems ? "default" : "muted"} sub={c.problems ? "Blocking approval" : "None"} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["/admin/users", "Users and access", "Create accounts, reset PINs, set roles, assign workers to managers, grant CostMaster."],
          ["/admin/projects", "Projects", "Clients, projects, addresses, SIN, project types and dates."],
          ["/admin/rates", "Rates", "Agreed hourly or day rates in EUR with effective dates and overrides."],
          ["/admin/import", "Import from CSV", "Bulk upload workers and previous weeks' hours, checked before anything is saved."],
          ["/admin/support", "IT support access", "Authorise and revoke time-limited support access."],
          ["/admin/settings", "Settings", "Long-shift flag threshold and manager CSV export."],
          ["/admin/audit", "Audit log", "Who changed permissions, assignments, rates and approvals."],
        ].map(([href, title, desc]) => (
          <Link key={href} href={href} className="card block hover:border-brand-400">
            <div className="h2">{title}</div>
            <p className="muted mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
