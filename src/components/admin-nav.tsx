"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 overflow-x-auto py-1" aria-label="Admin">
      <ul className="flex w-max min-w-full gap-2 px-1">
        {LINKS.map(([href, label]) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-xl border px-4 py-2 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e] ${
                  active
                    ? "border-[#ddcbb0] bg-[#ddcbb0] text-slate-950"
                    : "border-[#d8bc9e] bg-[#fcf8f2] hover:border-[#b58e59] hover:bg-[#f2e6d3]"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
