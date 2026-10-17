"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import type { FormState } from "./actions";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export const inputClass = "field";

function Result({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-bad">{state.error}</p>;
  if (state.message) return <p className="text-sm text-ink-2">{state.message}</p>;
  return null;
}

/** A form bound to a server action, with its result shown under it. */
export function ActionForm({
  action,
  children,
  submit,
  className,
  resetOnSuccess = false,
}: {
  action: Action;
  children: React.ReactNode;
  submit: string;
  className?: string;
  /** Clear the fields once it worked (forms that add something); they're always kept on an error. */
  resetOnSuccess?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  const [, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.message && !state.error) form.current?.reset();
  }, [state, resetOnSuccess]);
  // Submitted by hand rather than through `action`, which would clear every field even when the
  // server answers with an error to fix.
  const submitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  };
  return (
    <form ref={form} onSubmit={submitForm} className={className ?? "grid gap-3"}>
      {children}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Working…" : submit}
        </button>
        <Result state={state} />
      </div>
      {state.token ? (
        <code className="block rounded-md border border-line bg-code px-3 py-2 font-mono text-sm break-all">{state.token}</code>
      ) : null}
    </form>
  );
}

/** One-click actions (poll, backfill, import) that share a result line. */
export function ActionButtons({ action, buttons }: { action: Action; buttons: { value: string; label: string; hint: string }[] }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button key={b.value} name="action" value={b.value} disabled={pending} title={b.hint} className="btn btn-ghost">
            {b.label}
          </button>
        ))}
      </div>
      <Result state={state} />
    </form>
  );
}
