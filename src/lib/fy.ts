// Financial year runs 1 Apr – 31 Mar.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive ISO bounds + label (e.g. "2026-27") for the FY containing `isoDate`. */
export function fyBounds(isoDate: string): { start: string; end: string; label: string } {
  const [y, m] = isoDate.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

export function currentFy() {
  return fyBounds(todayISO());
}
