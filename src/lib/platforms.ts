/** Platform ids as projects report them (decomp.dev used the same short ids) and their display names. */
export const PLATFORMS: Record<string, string> = {
  "3ds": "Nintendo 3DS",
  dc: "Dreamcast",
  gba: "Game Boy Advance",
  gbc: "Game Boy Color",
  gb: "Game Boy",
  gc: "GameCube",
  n64: "Nintendo 64",
  nds: "Nintendo DS",
  pc: "PC",
  ps: "PlayStation",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  psp: "PSP",
  saturn: "Saturn",
  snes: "Super Nintendo",
  switch: "Nintendo Switch",
  wii: "Wii",
  wiiu: "Wii U",
  xbox: "Xbox",
  x360: "Xbox 360",
};

export const platformName = (id: string | null | undefined) => (id ? (PLATFORMS[id.toLowerCase()] ?? id) : null);

/** Two ids for one platform (ps and ps1) filter as one. */
export const samePlatform = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && (platformName(a) ?? a).toLowerCase() === (platformName(b) ?? b).toLowerCase();

/**
 * The platform filter's choices: every known platform, each once whatever ids projects use for it,
 * with how many of USED are on it, plus any unknown ids projects use. Sorted by name.
 */
export function platformOptions(used: (string | null | undefined)[]): { id: string; name: string; count: number }[] {
  const byName = new Map<string, { id: string; name: string; count: number }>();
  const add = (id: string, count: number) => {
    const name = platformName(id) ?? id;
    const key = name.toLowerCase();
    const o = byName.get(key);
    if (o) o.count += count;
    else byName.set(key, { id: id.toLowerCase(), name, count });
  };
  for (const id of Object.keys(PLATFORMS)) add(id, 0);
  for (const id of used) if (id) add(id, 1);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
