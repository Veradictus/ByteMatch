"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Counts page views for the admin Statistics page: one small request per page shown, with the
 * referring site on the first. No cookies, nothing stored in the browser, and nothing sent at all
 * when the browser asks not to be tracked (Do Not Track, Global Privacy Control).
 */
export function PageViews() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const body = JSON.stringify({ p: path, r: first.current ? document.referrer : "" });
    first.current = false;
    try {
      if (!navigator.sendBeacon?.("/api/hit", body)) {
        void fetch("/api/hit", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    } catch {
      // Counting must never get in the way of the page.
    }
  }, [path]);
  return null;
}
