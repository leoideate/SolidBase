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
    <nav className="mx-auto max-w-6xl overflow-x-auto px-2" aria-label="Main">
      <ul className="flex gap-1 pb-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                active === l.href ? "bg-brand-500 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"
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
