"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/stats", "Statistics"],
  ["/admin/projects", "Projects"],
  ["/admin/jobs", "Jobs"],
  ["/admin/users", "Users"],
  ["/admin/games", "Games"],
  ["/admin/themes", "Themes"],
  ["/admin/log", "Audit log"],
  ["/admin/settings", "Settings"],
] as const;

export function AdminNav({ owner }: { owner: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {TABS.filter(([href]) => owner || href !== "/admin/settings").map(([href, label]) => {
        const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
