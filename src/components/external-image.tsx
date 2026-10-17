"use client";

import { useState } from "react";

/**
 * An image hosted elsewhere (projects link their own). It loads without a referrer, and a link
 * that fails to load is replaced by FALLBACK (or nothing) instead of a broken-image box.
 */
export function ExternalImage({
  src,
  className,
  style,
  fallback = null,
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- hosted elsewhere; Next's optimizer would fetch it through this server
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} style={style} />
  );
}
