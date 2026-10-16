"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "./icons";

/**
 * The one dropdown: our own button and listbox rather than a native <select>.
 *
 * A native control's closed box can be themed, but its open list cannot — the
 * browser or OS draws it and no CSS reaches inside. So the list is drawn here
 * with the page's tokens, while the trigger keeps the shared `.field` look
 * every text input already has. A `name` renders a hidden input, so a Select
 * inside a form still submits its value to the server action.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Box {
  left: number;
  minWidth: number;
  maxWidth: number;
  top: number | null;
  bottom: number | null;
  max: number;
}

const INITIAL_BOX: Box = { left: 0, minWidth: 0, maxWidth: 0, top: null, bottom: null, max: 240 };
/** Tall enough never to bind the list while it is being measured. */
const UNCONSTRAINED = 100000;

export function Select({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  id,
  disabled = false,
  placeholder = "—",
  className = "",
  buttonClassName = "",
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  "aria-label"?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const current = controlled ? value : inner;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<Box>(INITIAL_BOX);

  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const activeRef = useRef(0);
  const typeahead = useRef("");
  const typeaheadAt = useRef(0);
  const listId = `ts-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  const label = options.find((o) => o.value === current)?.label ?? current ?? "";

  const enabledIndexes = useCallback(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);

  const keepVisible = useCallback(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${activeRef.current}"]`)?.scrollIntoView({ block: "nearest" });
  }, []);

  /**
   * Where the list goes: fixed, anchored to the trigger, because it opens over
   * panes whose `overflow` would otherwise clip it.
   *
   * Which way it opens depends on the list's own height, and the list does not
   * exist until `open` has rendered it, so this runs in two passes. The first
   * leaves the height unconstrained purely so the list can be measured at its
   * natural size; the second decides. The question is not "is there more room
   * above than below" but "does it fit below" — otherwise a control in the
   * lower half of a table flips up with acres of space beneath it.
   */
  const place = useCallback(
    (revealActive = false) => {
      const el = btn.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 2;
      const pad = 8;
      const roomBelow = window.innerHeight - r.bottom - gap - pad;
      const roomAbove = r.top - gap - pad;
      const width = {
        left: r.left,
        minWidth: r.width,
        maxWidth: Math.max(r.width, window.innerWidth - r.left - pad),
      };
      setBox({ ...width, top: r.bottom + gap, bottom: null, max: UNCONSTRAINED });
      requestAnimationFrame(() => {
        const ul = list.current;
        if (!ul) return;
        const natural = ul.offsetHeight;
        const flip = natural > roomBelow && roomAbove > roomBelow;
        const room = Math.max(flip ? roomAbove : roomBelow, 96);
        setBox({
          ...width,
          top: flip ? null : r.bottom + gap,
          bottom: flip ? window.innerHeight - r.top + gap : null,
          max: room,
        });
        if (revealActive) keepVisible();
      });
    },
    [keepVisible],
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  const step = (from: number, dir: 1 | -1) => {
    const ok = enabledIndexes();
    if (!ok.length) return;
    let n = ok.indexOf(from);
    if (n < 0) n = dir === 1 ? -1 : 0;
    const next = ok[(n + dir + ok.length) % ok.length];
    activeRef.current = next;
    setActive(next);
    keepVisible();
  };

  const show = (from?: "first" | "last" | "current") => {
    if (disabled) return;
    const ok = enabledIndexes();
    if (!ok.length) return;
    const here = ok.indexOf(options.findIndex((o) => o.value === current));
    const next = from === "last" ? ok[ok.length - 1] : from === "current" && here >= 0 ? ok[here] : ok[0];
    activeRef.current = next;
    setActive(next);
    setOpen(true);
    place(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (!controlled) setInner(o.value);
    onChange?.(o.value);
    close();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        step(activeRef.current, 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        step(activeRef.current, -1);
        return;
      case "Home": {
        e.preventDefault();
        const ok = enabledIndexes();
        activeRef.current = ok[0];
        setActive(ok[0]);
        keepVisible();
        return;
      }
      case "End": {
        e.preventDefault();
        const ok = enabledIndexes();
        activeRef.current = ok[ok.length - 1];
        setActive(ok[ok.length - 1]);
        keepVisible();
        return;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeRef.current);
        return;
      case "Escape":
        e.preventDefault();
        close();
        return;
      case "Tab":
        close(false);
        return;
    }
    // Type-ahead: a long list is not something to arrow through to reach one entry.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = performance.now();
      typeahead.current = now - typeaheadAt.current > 600 ? e.key : typeahead.current + e.key;
      typeaheadAt.current = now;
      const needle = typeahead.current.toLowerCase();
      const hit = options.findIndex((o, i) => !o.disabled && i >= activeRef.current && o.label.toLowerCase().startsWith(needle));
      const wrap = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(needle));
      const found = hit >= 0 ? hit : wrap;
      if (found >= 0) {
        activeRef.current = found;
        setActive(found);
        keepVisible();
      }
    }
  };

  // Focus stays on the trigger while the list is open, so every key is handled
  // here; `onListKey` also runs on the list itself for a click that lands there.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open) {
      onListKey(e);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show("current");
      step(activeRef.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show();
    }
  };

  // Click-away, and the repositioning a fixed layer needs whenever the page
  // under it moves. The scroll listener is in the capture phase because a
  // scrolling container's own `scroll` does not bubble; the list's own scroll
  // is ignored so re-measuring it does not undo the gesture.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const move = (e: Event) => {
      if (e.target === list.current) return;
      place();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open, close, place]);

  // The trigger keeps focus while the list is open, so the active option is
  // announced from the trigger (aria-activedescendant), not the list.
  return (
    <div className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        id={id}
        role="combobox"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        className={`field flex cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-55 ${buttonClassName}`}
      >
        <span className="min-w-0 flex-1 truncate">{label || placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-ink-3" />
      </button>

      {open
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              tabIndex={-1}
              onKeyDown={onListKey}
              onClick={(e) => {
                const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
                if (i !== undefined) choose(Number(i));
              }}
              style={{
                left: box.left,
                minWidth: box.minWidth,
                maxWidth: box.maxWidth,
                top: box.top ?? undefined,
                bottom: box.bottom ?? undefined,
                maxHeight: box.max,
              }}
              className="fixed z-50 overflow-x-hidden overflow-y-auto rounded-[var(--radius-control)] border border-line-strong bg-surface p-1 text-sm text-ink shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)] outline-none select-none"
            >
              {options.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled || undefined}
                  className={`truncate rounded-sm px-2.5 py-1.5 ${
                    o.disabled ? "cursor-default opacity-40" : "cursor-pointer hover:bg-surface-2"
                  } ${i === active ? "bg-surface-3" : ""} ${o.value === current ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
                >
                  {o.label}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}

      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
