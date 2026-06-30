// Benefit Wallet mock data. Annual caps per FY (Sports ₹15,000, Learning ₹45,000).
// "Used" reserves approved + pending so an employee can't over-commit.

export type CategoryKey = "sports" | "learning";

export type Category = {
  key: CategoryKey;
  label: string;
  cap: number;
  approved: number;
  pending: number;
};

export const CATEGORIES: Record<CategoryKey, Category> = {
  sports: { key: "sports", label: "Sports", cap: 15000, approved: 6000, pending: 0 },
  learning: { key: "learning", label: "Learning", cap: 45000, approved: 22000, pending: 5000 },
};

export const FY_LABEL = "FY 2026–27 · Apr–Mar";

export function available(cat: Category): number {
  return cat.cap - cat.approved - cat.pending;
}

export type ClaimStatus = "Auto-approved" | "Approved" | "Pending HR" | "Reimbursed" | "Rejected";

export type RecentClaim = {
  vendor: string;
  category: string;
  date: string;
  amount: number;
  status: ClaimStatus;
};

export const RECENT_CLAIMS: RecentClaim[] = [
  { vendor: "Cult.fit membership", category: "Sports", date: "12 Jun", amount: 6000, status: "Auto-approved" },
  { vendor: "Coursera Plus annual", category: "Learning", date: "04 Jun", amount: 22000, status: "Auto-approved" },
  { vendor: "Decathlon · running shoes", category: "Sports", date: "28 May", amount: 4200, status: "Pending HR" },
  { vendor: "Tech conference ticket", category: "Learning", date: "15 May", amount: 5000, status: "Reimbursed" },
];
