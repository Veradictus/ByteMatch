import type { CSSProperties } from "react";

/**
 * Project images are links to images hosted elsewhere; ByteMatch never downloads or stores them.
 * The server only checks the link's shape (it does not fetch it, so a link cannot make the server
 * request internal addresses); browsers load the image directly, without a referrer.
 */
export const MAX_IMAGE_URL_LENGTH = 2048;

/** A clean https URL, or an error message. Empty input means "no image". */
export function checkImageUrl(input: string): { url: string | null } | { error: string } {
  const raw = input.trim();
  if (!raw) return { url: null };
  if (raw.length > MAX_IMAGE_URL_LENGTH) return { error: "That link is too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Enter a full link, starting with https://." };
  }
  if (url.protocol !== "https:") return { error: "The image link must start with https://." };
  if (url.username || url.password) return { error: "The link must not contain a username or password." };
  return { url: url.toString() };
}

/** A cover position from the form's posX/posY; the middle (stored as null) when missing or centred. */
export function coverPositionFrom(x: unknown, y: unknown): { x: number; y: number } | null {
  const clamp = (v: unknown) => {
    const n = typeof v === "string" && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : 50;
  };
  const pos = { x: clamp(x), y: clamp(y) };
  return pos.x === 50 && pos.y === 50 ? null : pos;
}

/** The style that keeps a cover's chosen point in view. */
export function coverStyle(pos: { x: number; y: number } | null | undefined): CSSProperties | undefined {
  return pos ? { objectPosition: `${pos.x}% ${pos.y}%` } : undefined;
}
