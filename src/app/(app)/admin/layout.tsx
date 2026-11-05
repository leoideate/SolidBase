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
    <div className="space-y-7">
      <nav className="-mx-1 overflow-x-auto py-1" aria-label="Admin">
        <ul className="flex w-max min-w-full gap-2 px-1">
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="block rounded-xl border border-[#d8bc9e] bg-[#fcf8f2] px-4 py-2 text-sm whitespace-nowrap transition-colors hover:border-[#b58e59] hover:bg-[#f2e6d3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e]">
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
