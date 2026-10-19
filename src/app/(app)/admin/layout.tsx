import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/projects", "Projects"],
  ["/admin/job-roles", "Roles"],
  ["/admin/rates", "Rates"],
  ["/admin/import", "Import CSV"],
  ["/admin/support", "IT support access"],
  ["/admin/settings", "Settings"],
  ["/admin/exports", "Export history"],
  ["/admin/audit", "Audit log"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!actor.isAdmin) redirect("/");
  return (
    <div className="space-y-4">
      <nav className="-mx-1 overflow-x-auto" aria-label="Admin">
        <ul className="flex gap-1 px-1">
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm whitespace-nowrap hover:border-brand-400">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}
