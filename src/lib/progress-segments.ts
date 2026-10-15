/** Percentages are cumulative; each segment occupies only its non-overlapping remainder. */
export function progressSegments(matched: number, linked = 0, fuzzy = 0) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const complete = clamp(linked);
  const perfect = Math.max(complete, clamp(matched));
  const partial = Math.max(perfect, clamp(fuzzy));
  return [
    { key: "linked", width: complete, value: complete, label: "fully linked", className: "match-linked" },
    {
      key: "matched",
      width: perfect - complete,
      value: clamp(matched),
      label: "perfect match",
      className: complete ? "match-striped" : "match-solid",
    },
    { key: "fuzzy", width: partial - perfect, value: clamp(fuzzy), label: "fuzzy match", className: "match-fuzzy" },
  ].filter((s) => s.width > 0);
}
