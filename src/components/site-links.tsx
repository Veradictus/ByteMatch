"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Projects" },
  { href: "/games", label: "Games" },
  { href: "/ports", label: "Ports" },
  { href: "/activity", label: "Activity" },
  { href: "/docs", label: "Docs" },
];

/** The header's section links; the current section is marked for screen readers and for styles. */
export function SiteLinks({ className }: { className: string }) {
  const path = usePathname();
  return (
    <div className="site-links hidden items-center gap-1 md:flex">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`site-link ${className}`}
          aria-current={(href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`)) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
