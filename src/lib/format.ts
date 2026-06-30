// Money is conceptually stored as integer paise; these mock figures are whole
// rupees. Always format through here so the ₹ + en-IN grouping is consistent.
export function formatINR(amount: number): string {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}
