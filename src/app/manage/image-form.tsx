"use client";

import { useActionState, useRef, useState } from "react";
import type { FormState } from "./actions";

type Pos = { x: number; y: number };
const MIDDLE: Pos = { x: 50, y: 50 };

/**
 * A link to the project's banner image, with a live preview; links that don't load can't be saved.
 * The cover's preview can be dragged (or moved with the arrow keys) to choose which part of it
 * stays in view where a frame crops it.
 */
export function ImageForm({
  current,
  name,
  action,
  shape,
  position,
}: {
  current: string | null;
  /** The cover's saved position (percent from the left and top). */
  position?: Pos | null;
  name: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  /** "wide" for the cover banner, "square" for the icon. */
  shape: "wide" | "square";
}) {
  const what = shape === "square" ? "icon" : "cover";
  const [state, run, pending] = useActionState(action, {});
  const [url, setUrl] = useState(current ?? "");
  const [status, setStatus] = useState<"empty" | "loading" | "ok" | "broken">(current ? "loading" : "empty");
  const trimmed = url.trim();
  const httpsLink = /^https:\/\/\S+$/i.test(trimmed);
  const movable = shape === "wide" && httpsLink && status === "ok";
  const [pos, setPos] = useState<Pos>(position ?? MIDDLE);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ px: number; py: number; from: Pos; spare: { x: number; y: number } } | null>(null);
  const objectPosition = `${pos.x}% ${pos.y}%`;
  const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

  /** How far the cropped image overhangs the frame on each axis, in pixels (what dragging can use). */
  const spare = () => {
    const el = img.current;
    if (!el?.naturalWidth) return { x: 0, y: 0 };
    const { width: fw, height: fh } = el.getBoundingClientRect();
    const scale = Math.max(fw / el.naturalWidth, fh / el.naturalHeight);
    return { x: el.naturalWidth * scale - fw, y: el.naturalHeight * scale - fh };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!movable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, from: pos, spare: spare() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Dragging the picture down shows more of its top, so the position moves the other way.
    setPos({
      x: d.spare.x > 0 ? clamp(d.from.x - ((e.clientX - d.px) / d.spare.x) * 100) : d.from.x,
      y: d.spare.y > 0 ? clamp(d.from.y - ((e.clientY - d.py) / d.spare.y) * 100) : d.from.y,
    });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!movable) return;
    const step = e.shiftKey ? 10 : 2;
    const move: Record<string, Pos> = {
      ArrowUp: { x: pos.x, y: pos.y + step },
      ArrowDown: { x: pos.x, y: pos.y - step },
      ArrowLeft: { x: pos.x + step, y: pos.y },
      ArrowRight: { x: pos.x - step, y: pos.y },
    };
    const next = move[e.key];
    if (!next) return;
    e.preventDefault();
    setPos({ x: clamp(next.x), y: clamp(next.y) });
  };

  return (
    <form action={run} className="grid gap-4">
      <div
        className={`relative overflow-hidden rounded-xl border border-line bg-surface-2 ${shape === "square" ? "aspect-square w-32" : "aspect-[3/1]"} ${movable ? "cursor-grab touch-none select-none focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        tabIndex={movable ? 0 : undefined}
        role={movable ? "group" : undefined}
        aria-label={movable ? "Cover position: drag the image, or use the arrow keys (Shift for bigger steps)" : undefined}
      >
        {httpsLink ? (
          // eslint-disable-next-line @next/next/no-img-element -- an image hosted elsewhere, shown as a preview
          <img
            key={trimmed}
            ref={(el) => {
              img.current = el;
              // Loaded before the page could listen (cached, or ahead of hydration): onLoad never fires.
              if (el?.complete) setStatus(el.naturalWidth ? "ok" : "broken");
            }}
            src={trimmed}
            draggable={false}
            style={shape === "wide" ? { objectPosition } : undefined}
            alt={`${name} ${what} preview`}
            referrerPolicy="no-referrer"
            onLoad={() => setStatus("ok")}
            onError={() => setStatus("broken")}
            className={`size-full object-cover ${status === "broken" ? "hidden" : ""}`}
          />
        ) : null}
        {!httpsLink || status === "broken" ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-ink-3">
            {status === "broken" && httpsLink
              ? "That link doesn't load as an image."
              : trimmed
                ? "The link must start with https://."
                : shape === "square"
                  ? "No icon"
                  : "No cover. Paste a link to a wide banner (about 1500 × 500)."}
          </div>
        ) : null}
      </div>
      {movable ? (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
          <span>Drag the image to choose what stays in view; frames elsewhere crop around the same point.</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">
              {Math.round(pos.x)}% · {Math.round(pos.y)}%
            </span>
            {pos.x !== 50 || pos.y !== 50 ? (
              <button type="button" onClick={() => setPos(MIDDLE)} className="text-accent hover:underline">
                Center
              </button>
            ) : null}
          </span>
          {/* What a game card shows of it: a narrower frame, cropped around the same point. */}
          <span className="ml-auto flex items-center gap-2">
            On game cards
            {/* eslint-disable-next-line @next/next/no-img-element -- the same hosted image, cropped as a game card does */}
            <img
              src={trimmed}
              alt=""
              referrerPolicy="no-referrer"
              draggable={false}
              className="aspect-[16/7] w-28 rounded-md border border-line object-cover"
              style={{ objectPosition }}
            />
          </span>
          <input type="hidden" name="posX" value={pos.x} />
          <input type="hidden" name="posY" value={pos.y} />
        </div>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        {shape === "square" ? "Icon link" : "Cover link"}{" "}
        <span className="text-xs text-ink-3">
          {shape === "square" ? "square, about 256 × 256" : "wide, about 1500 × 500"}; https, hosted anywhere public
        </span>
        <input
          name="imageUrl"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setStatus(e.target.value.trim() ? "loading" : "empty");
            setPos(MIDDLE);
          }}
          placeholder="https://…/banner.png"
          className="field"
          inputMode="url"
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || (trimmed !== "" && status !== "ok")} className="btn btn-primary">
          {pending ? "Saving…" : trimmed ? `Save ${what}` : `Remove ${what}`}
        </button>
        {state.error ? (
          <p className="text-sm text-bad">{state.error}</p>
        ) : state.message ? (
          <p className="text-sm text-ink-2">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
