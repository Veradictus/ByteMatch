"use client";

import { useActionState, useState } from "react";
import type { FormState } from "./actions";

/** Deleting a project: the button only works once owner/repo has been typed out. */
export function DeleteProject({ slug, action }: { slug: string; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, {});
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toLowerCase() === slug.toLowerCase();
  return (
    <form action={run} className="grid gap-3">
      <label className="grid gap-1.5 text-sm">
        <span>
          Type <code className="font-mono text-xs">{slug}</code> to confirm
        </span>
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="field max-w-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={!ready || pending} className="btn bg-bad text-white disabled:opacity-40">
          {pending ? "Deleting…" : "Delete project"}
        </button>
        {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      </div>
    </form>
  );
}
