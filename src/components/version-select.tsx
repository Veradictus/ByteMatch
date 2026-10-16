"use client";

import { useRouter } from "next/navigation";
import { Select } from "./ui/select";

/** Switches game version; each version has its own page. */
export function VersionSelect({
  base,
  versions,
  current,
  defaultVersion,
}: {
  base: string;
  versions: string[];
  current: string;
  defaultVersion: string;
}) {
  const router = useRouter();
  return (
    <Select
      value={current}
      onChange={(v) => router.push(v === defaultVersion ? base : `${base}/${encodeURIComponent(v)}`)}
      aria-label="Game version"
      className="w-auto min-w-36"
      buttonClassName="h-9 font-mono text-xs"
      options={versions.map((v) => ({ value: v, label: v }))}
    />
  );
}
