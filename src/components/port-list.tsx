import Link from "next/link";
import type { Port } from "@/db/schema";
import { PORT_PLATFORMS, PORT_STATUSES, portHost } from "@/lib/ports";
import { ArrowUpRight } from "./ui/icons";

type Shown = Pick<Port, "id" | "name" | "url" | "platforms" | "status" | "version" | "note"> & {
  /** The decompilation it's built from, when the list mixes projects. */
  from?: { name: string; href: string };
};

const STATUS_CHIP: Record<string, string> = {
  playable: "bg-done/15 text-good",
  progress: "bg-surface-3 text-ink",
  early: "bg-surface-3 text-ink-3",
};

export function PortStatus({ status }: { status: string }) {
  const s = PORT_STATUSES[status as keyof typeof PORT_STATUSES];
  return (
    <span
      title={s?.hint}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[status] ?? STATUS_CHIP.early}`}
    >
      {s?.label ?? status}
    </span>
  );
}

/** Ports as a list of outgoing links: name and how far along, then where it runs and where it lives. */
export function PortList({ ports, compact = false }: { ports: Shown[]; compact?: boolean }) {
  return (
    <ul className={compact ? "-mx-2 grid grid-cols-[minmax(0,1fr)]" : "grid grid-cols-[minmax(0,1fr)] divide-y divide-line"}>
      {ports.map((p) => (
        <li key={p.id} className={compact ? "" : "px-5 py-3.5"}>
          <div className={compact ? "rounded-lg px-2 py-2 transition-colors hover:bg-surface-2" : ""}>
            <div className="flex items-center gap-2">
              <a
                href={p.url}
                rel="noopener noreferrer nofollow ugc"
                target="_blank"
                className="group inline-flex min-w-0 items-center gap-1 text-sm font-medium hover:underline"
              >
                <span className="truncate">{p.name}</span>
                <ArrowUpRight size={12} className="shrink-0 text-ink-3 group-hover:text-ink" />
              </a>
              <PortStatus status={p.status} />
            </div>
            <p className="mt-0.5 text-xs text-ink-3">
              {p.platforms.map((x) => PORT_PLATFORMS[x as keyof typeof PORT_PLATFORMS] ?? x).join(" · ")}
              {compact ? <br /> : <span className="px-1.5 text-line-strong">|</span>}
              <span className="font-mono">{portHost(p.url)}</span>
              {p.version ? <span className="font-mono"> · {p.version}</span> : null}
            </p>
            {p.note ? <p className="mt-1 text-xs text-ink-2">{p.note}</p> : null}
            {p.from ? (
              <p className="mt-1 text-xs text-ink-3">
                From{" "}
                <Link href={p.from.href} className="text-accent hover:underline">
                  {p.from.name}
                </Link>
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
