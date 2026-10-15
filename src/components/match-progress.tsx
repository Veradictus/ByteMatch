import { progressSegments } from "@/lib/progress-segments";

export function MatchProgress({
  matched,
  linked = 0,
  fuzzy = 0,
  label,
}: {
  matched: number;
  linked?: number;
  fuzzy?: number;
  label: string;
}) {
  const value = Math.max(0, Math.min(100, Number.isFinite(matched) ? matched : 0));
  return (
    <div
      className="match-track"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value.toFixed(2)}% matched${linked > 0 ? `, ${linked.toFixed(2)}% fully linked` : ""}`}
    >
      {progressSegments(matched, linked, fuzzy).map((s) => (
        <span key={s.key} className={s.className} style={{ width: `${s.width}%` }} title={`${s.value.toFixed(2)}% ${s.label}`} />
      ))}
    </div>
  );
}
