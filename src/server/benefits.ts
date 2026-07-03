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
