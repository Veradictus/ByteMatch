"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Projects" },
  { href: "/games", label: "Games" },
  { href: "/activity", label: "Activity" },
  { href: "/docs", label: "Docs" },
];

export function SiteLinks() {
  const path = usePathname();
  return (
    <div className="site-links hidden md:flex">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={(href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`)) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
