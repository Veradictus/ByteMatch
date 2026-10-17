/**
 * Ports: games built from a decompilation for other systems, mostly native PC versions. A
 * project's maintainers list them; ByteMatch links to them and never hosts anything.
 */

export const PORT_PLATFORMS = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
  web: "Browser",
  switch: "Switch",
  other: "Other",
} as const;
export type PortPlatform = keyof typeof PORT_PLATFORMS;

/** How far along it is, most finished first. */
export const PORT_STATUSES = {
  playable: { label: "Playable", hint: "Can be played start to finish" },
  progress: { label: "In progress", hint: "Runs, with parts missing" },
  early: { label: "Early", hint: "Boots or shows something; not playable yet" },
} as const;
export type PortStatus = keyof typeof PORT_STATUSES;

export const MAX_PORTS = 8;
const MAX_NAME = 80;
const MAX_NOTE = 200;

export interface PortInput {
  name: string;
  url: string;
  platforms: PortPlatform[];
  status: PortStatus;
  version: string | null;
  note: string | null;
}

/** Checks what the manage form sent; `versions` are the project's, for the optional version. */
export function checkPort(
  raw: { name?: unknown; url?: unknown; platforms?: unknown[]; status?: unknown; version?: unknown; note?: unknown },
  versions: string[],
): { port: PortInput } | { error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const name = str(raw.name);
  if (!name) return { error: "Give the port a name." };
  if (name.length > MAX_NAME) return { error: `Keep the name under ${MAX_NAME} characters.` };

  const input = str(raw.url);
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return { error: "Enter the port's link, e.g. https://github.com/you/port." };
  }
  if (url.protocol !== "https:") return { error: "Use an https link." };
  if (url.username || url.password || !url.hostname.includes("."))
    return { error: "Enter the port's link, e.g. https://github.com/you/port." };
  if (url.href.length > 500) return { error: "That link is too long." };

  const platforms = [...new Set((raw.platforms ?? []).map(str))].filter((p): p is PortPlatform => p in PORT_PLATFORMS);
  if (!platforms.length) return { error: "Pick at least one platform it runs on." };

  const status = str(raw.status);
  if (!(status in PORT_STATUSES)) return { error: "Pick how far along it is." };

  const version = str(raw.version) || null;
  if (version && !versions.includes(version)) return { error: "That version has no reports here." };

  const note = str(raw.note) || null;
  if (note && note.length > MAX_NOTE) return { error: `Keep the note under ${MAX_NOTE} characters.` };

  return { port: { name, url: url.href, platforms, status: status as PortStatus, version, note } };
}

/** A short label for the link: "github.com/you/port", or the host. */
export function portHost(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.split("/").filter(Boolean);
    return ["github.com", "gitlab.com", "codeberg.org"].includes(host) && path.length >= 2 ? `${host}/${path[0]}/${path[1]}` : host;
  } catch {
    return url;
  }
}

/** The game a port is of: its version's, when the repository holds several games, else the project's. */
export function portGame(
  port: { version: string | null },
  project: { game: string | null; versionGames?: Record<string, { game: string }> | null },
): string | null {
  return (port.version && project.versionGames?.[port.version]?.game) || project.game;
}
