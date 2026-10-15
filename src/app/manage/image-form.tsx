"use client";

import { useActionState, useState } from "react";
import type { FormState } from "./actions";

/** A link to the project's banner image, with a live preview; links that don't load can't be saved. */
export function ImageForm({
  current,
  name,
  action,
  shape,
}: {
  current: string | null;
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

  return (
    <form action={run} className="grid gap-4">
      <div
        className={`relative overflow-hidden rounded-xl border border-line bg-surface-2 ${shape === "square" ? "aspect-square w-32" : "aspect-[3/1]"}`}
      >
        {httpsLink ? (
          // eslint-disable-next-line @next/next/no-img-element -- an image hosted elsewhere, shown as a preview
          <img
            key={trimmed}
            src={trimmed}
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
                  : "Automatic artwork is used when configured. Paste a link to choose your own cover."}
          </div>
        ) : null}
      </div>
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
          }}
          placeholder="https://…/banner.png"
          className="field"
          inputMode="url"
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || (trimmed !== "" && status !== "ok")} className="btn btn-primary">
          {pending ? "Saving…" : trimmed ? `Save ${what}` : shape === "wide" ? "Use automatic cover" : `Remove ${what}`}
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
