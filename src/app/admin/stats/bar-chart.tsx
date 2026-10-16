"use client";

import { useState } from "react";

const fmt = new Intl.NumberFormat("en-US");
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One measure per day as bars: thin, rounded at the data end, anchored to the baseline, with a
 * hover (or tap) readout above. One series, so the title names it and there's no legend.
 */
export function DailyBars({ data, color, unit }: { data: { day: string; value: number }[]; color: string; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const shown = hover === null ? null : data[hover];
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div>
      <div className="mb-2 flex h-5 items-baseline justify-between gap-3 text-xs" aria-live="polite">
        {shown ? (
          <span>
            <span className="font-mono text-ink">{fmt.format(shown.value)}</span> <span className="text-ink-3">{unit} on</span>{" "}
            <span className="text-ink-2">{dayLabel(shown.day)}</span>
          </span>
        ) : (
          <span className="text-ink-3">Point at a day for its number</span>
        )}
        <span className="font-mono text-ink-3">max {fmt.format(max)}</span>
      </div>
      <div
        className="relative flex h-40 items-end gap-[2px] border-b border-line"
        role="img"
        aria-label={`${fmt.format(total)} ${unit} over ${data.length} days, at most ${fmt.format(max)} a day`}
        onMouseLeave={() => setHover(null)}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        {data.map((d, i) => (
          <button
            key={d.day}
            type="button"
            tabIndex={-1}
            aria-label={`${dayLabel(d.day)}: ${fmt.format(d.value)} ${unit}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => setHover(i)}
            className="relative flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className="w-full rounded-t-[4px] transition-opacity"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value ? 2 : 0,
                background: color,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{data[0] ? dayLabel(data[0].day) : ""}</span>
        <span>{data.length ? dayLabel(data[data.length - 1].day) : ""}</span>
      </div>
    </div>
  );
}
