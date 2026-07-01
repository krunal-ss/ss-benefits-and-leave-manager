// KAN-70: parse a `?page=` search param into a safe 1-based page number.
// Falls back to page 1 for missing / non-numeric / out-of-range values.
export function pageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
