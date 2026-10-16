"use client";

import { useActionState, useState } from "react";
import { Select } from "@/components/ui/select";
import type { AdminState } from "./actions";

/** A destructive button that asks once more before it acts. */
export function ConfirmButton({
  action,
  fields,
  label,
  confirm,
  reason,
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirm: string;
  /** Ask for a reason (kept in the audit log). */
  reason?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <button type="button" onClick={() => setArmed(true)} className="rounded-lg px-2 py-1 text-xs text-bad hover:bg-bad/10">
        {label}
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {reason ? <input name="reason" placeholder="Reason (logged)" className="field h-7 w-36 px-2 text-xs" autoFocus /> : null}
      <button className="rounded-lg bg-bad px-2 py-1 text-xs font-medium text-white">{confirm}</button>
      <button type="button" onClick={() => setArmed(false)} className="rounded-lg px-2 py-1 text-xs text-ink-3 hover:text-ink">
        Cancel
      </button>
    </form>
  );
}

/** A plain action button posted as a form, with its hidden fields. */
export function ActionButton({
  action,
  fields,
  label,
  tone = "ghost",
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  tone?: "ghost" | "plain";
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        className={
          tone === "ghost" ? "rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink" : "btn btn-ghost h-9 px-3 text-sm"
        }
      >
        {label}
      </button>
    </form>
  );
}

export function BlockForm({ action }: { action: (s: AdminState, f: FormData) => Promise<AdminState> }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm">
        GitHub username
        <input name="login" required placeholder="octocat" className="field" autoComplete="off" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Reason <span className="text-xs text-ink-3">kept in the audit log</span>
        <input name="reason" placeholder="Obscene project image" className="field" />
      </label>
      <button disabled={pending} className="btn bg-bad text-white hover:bg-bad/90">
        {pending ? "Blocking…" : "Block"}
      </button>
      <label className="flex items-center gap-2 text-sm text-ink-2 sm:col-span-3">
        <input type="checkbox" name="takeDown" defaultChecked className="size-4 accent-[var(--bad)]" /> Also take their submitted projects
        offline
      </label>
      {state.error ? (
        <p className="text-sm text-bad sm:col-span-3">{state.error}</p>
      ) : state.message ? (
        <p className="text-sm text-ink-2 sm:col-span-3">{state.message}</p>
      ) : null}
    </form>
  );
}

export function AppointForm({ action }: { action: (s: AdminState, f: FormData) => Promise<AdminState> }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm">
        GitHub username
        <input name="login" required placeholder="octocat" className="field" autoComplete="off" />
      </label>
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Appointing…" : "Appoint admin"}
      </button>
      {state.error ? (
        <p className="text-sm text-bad sm:col-span-2">{state.error}</p>
      ) : state.message ? (
        <p className="text-sm text-ink-2 sm:col-span-2">{state.message}</p>
      ) : null}
    </form>
  );
}

export function ThemeSharingForm({
  action,
  paused,
  dailyLimit,
}: {
  action: (s: AdminState, f: FormData) => Promise<AdminState>;
  paused: boolean;
  dailyLimit: number;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="paused" defaultChecked={paused} className="size-4 accent-[var(--bad)]" /> Pause sharing new themes
        <span className="text-xs text-ink-3">(existing codes keep working)</span>
      </label>
      <label className="grid max-w-xs gap-1.5 text-sm">
        New codes allowed per day, site-wide
        <input name="dailyLimit" type="number" min={0} max={1000000} defaultValue={dailyLimit} className="field" required />
      </label>
      <button disabled={pending} className="btn btn-primary justify-self-start">
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error ? (
        <p className="text-sm text-bad">{state.error}</p>
      ) : state.message ? (
        <p className="text-sm text-ink-2">{state.message}</p>
      ) : null}
    </form>
  );
}

/** One-click merge of two names, for the likely-duplicates list. */
export function MergeButton({
  action,
  kind,
  from,
  to,
}: {
  action: (s: AdminState, f: FormData) => Promise<AdminState>;
  kind: "game" | "franchise";
  from: string;
  to: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="inline">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <button disabled={pending} className="rounded-lg px-2 py-1 text-left text-xs text-accent hover:bg-accent/10">
        {pending ? "Merging…" : `Merge into “${to}”`}
      </button>
      {state.error ? <span className="ml-2 text-xs text-bad">{state.error}</span> : null}
    </form>
  );
}

/** Merge any two names, including ones that look nothing alike (regional titles). */
export function MergeForm({
  action,
  games,
  franchises,
}: {
  action: (s: AdminState, f: FormData) => Promise<AdminState>;
  games: string[];
  franchises: string[];
}) {
  const [state, run, pending] = useActionState(action, {});
  const [kind, setKind] = useState<"game" | "franchise">("game");
  const list = kind === "game" ? games : franchises;
  return (
    <form action={run} className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm">
        Kind
        <Select
          name="kind"
          value={kind}
          onChange={(v) => setKind(v as "game" | "franchise")}
          aria-label="Kind"
          options={[
            { value: "game", label: "Game" },
            { value: "franchise", label: "Franchise" },
          ]}
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        Name to merge
        <input name="from" required list="merge-names" className="field" placeholder="Ratchet & Clank 2" autoComplete="off" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Into
        <input name="to" required list="merge-names" className="field" placeholder="Ratchet & Clank: Going Commando" autoComplete="off" />
      </label>
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Merging…" : "Merge"}
      </button>
      <datalist id="merge-names">
        {list.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {state.error ? (
        <p className="text-sm text-bad sm:col-span-4">{state.error}</p>
      ) : state.message ? (
        <p className="text-sm text-ink-2 sm:col-span-4">{state.message}</p>
      ) : null}
    </form>
  );
}
