"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  // Longest matching prefix wins so /team/overview does not also highlight /team.
  const active = links
    .filter((l) => path === l.href || path.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="col-span-2 row-start-2 min-w-0 overflow-x-auto py-1 xl:col-span-1 xl:col-start-2 xl:row-start-1" aria-label="Main">
      <ul className="flex w-max min-w-full items-center gap-1 xl:gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active === l.href ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-2xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92754e] xl:px-4 ${
                active === l.href ? "bg-[#ddcbb0] text-slate-950" : "text-slate-950 hover:bg-[#f5f1eb]"
              }`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
