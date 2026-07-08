// Money is conceptually stored as integer paise; these mock figures are whole
// rupees. Always format through here so the ₹ + en-IN grouping is consistent.
export function formatINR(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

/** "31 Mar 2027" — used for FY-end dates on the dashboard banner + reminder settings screen. */
export function formatDateLong(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
