"use client";

import { useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("bytematch-theme");
    } catch {}
    document.documentElement.dataset.theme = stored === "light" || stored === "dark" ? stored : system.matches ? "dark" : "light";
    notify();
  };
  const changed = () => notify();
  sync();
  system.addEventListener("change", sync);
  window.addEventListener("storage", sync);
  window.addEventListener("bytematch-theme", changed);
  return () => {
    system.removeEventListener("change", sync);
    window.removeEventListener("storage", sync);
    window.removeEventListener("bytematch-theme", changed);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  );
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      aria-pressed={theme === "dark"}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("bytematch-theme", next);
        } catch {}
        window.dispatchEvent(new Event("bytematch-theme"));
      }}
    >
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 7a5 5 0 0 1 0 10Z" fill="currentColor" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </svg>
    </button>
  );
}
