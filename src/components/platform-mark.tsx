import { platformName } from "@/lib/platforms";

// Vendored artwork and upstream terms: public/platforms/ATTRIBUTION.md.
const logos: Record<string, string> = {
  "3ds": "nintendo_3ds",
  dc: "sega_dreamcast",
  gba: "gba",
  pc: "windows",
  gbc: "nintendo_gameboy_color",
  gb: "nintendo_gameboy",
  gc: "nintendo_gamecube_tall",
  n64: "nintendo_64_tall",
  nds: "nintendo_ds",
  ps: "playstation_ps_compact",
  ps1: "playstation_ps_compact",
  ps2: "playstation2",
  ps3: "playstation_ps3_compact",
  psp: "playstation_psp",
  saturn: "sega_saturn",
  snes: "nintendo_snes",
  switch: "nintendo_switch_tall",
  wii: "nintendo_wii",
  wiiu: "nintendo_wiiu",
  xbox: "xbox_original",
  x360: "xbox_360",
};

export function PlatformMark({ platform }: { platform: string | null }) {
  if (!platform) return null;
  const name = platformName(platform) ?? platform;
  const logo = logos[platform.toLowerCase()];
  const handheld = ["gb", "gbc"].includes(platform.toLowerCase());
  return (
    <span className="platform-mark" title={name} role="img" aria-label={name}>
      {handheld ? (
        <svg className="platform-device" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <path d="M9 2h14v17l-3 3H9Z" />
          <rect x="11" y="4" width="10" height="8" rx="1" />
          <path d="M10 16h5m-2.5-2.5v5m5-2h1m1-2h1m-7 5h4" />
        </svg>
      ) : logo ? (
        <span className="platform-logo" aria-hidden="true" style={{ maskImage: `url(/platforms/${logo}.svg)` }} />
      ) : (
        <span aria-hidden="true">{platform.toUpperCase()}</span>
      )}
    </span>
  );
}
