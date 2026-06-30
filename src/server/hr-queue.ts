// HR Head expense queue: claims that FAILED automated verification, with the
// extracted (OCR) fields, rule outcomes, and flags so the human decision is fast.

export type RuleCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type QueuedClaim = {
  id: string;
  name: string;
  dept: string;
  initials: string;
  category: string;
  claimed: number;
  extracted: number;
  vendor: string;
  date: string;
  confidence: string;
  flags: string[];
  checks: RuleCheck[];
};

export const HR_QUEUE: QueuedClaim[] = [
  {
    id: "BC-2041", name: "Sneha Patil", dept: "Engineering", initials: "SP", category: "Learning",
    claimed: 18000, extracted: 16500, vendor: "Udemy Business", date: "14 Jun 2026", confidence: "Low (61%)",
    flags: ["Amount mismatch", "Low OCR"],
    checks: [
      { label: "File readable", ok: true, detail: "PDF, 1.2 MB" },
      { label: "Not a duplicate", ok: true, detail: "No prior match" },
      { label: "Amount matches receipt", ok: false, detail: "₹16,500 vs ₹18,000" },
      { label: "Within FY 2026–27", ok: true, detail: "14 Jun 2026" },
      { label: "Balance sufficient", ok: true, detail: "₹27,000 left" },
      { label: "Vendor / category sanity", ok: true, detail: "Online course" },
    ],
  },
  {
    id: "BC-2038", name: "Arjun Desai", dept: "Sales", initials: "AD", category: "Sports",
    claimed: 16000, extracted: 16000, vendor: "Decathlon", date: "11 Jun 2026", confidence: "High (94%)",
    flags: ["Over balance"],
    checks: [
      { label: "File readable", ok: true, detail: "JPG, 0.8 MB" },
      { label: "Not a duplicate", ok: true, detail: "No prior match" },
      { label: "Amount matches receipt", ok: true, detail: "₹16,000" },
      { label: "Within FY 2026–27", ok: true, detail: "11 Jun 2026" },
      { label: "Balance sufficient", ok: false, detail: "Only ₹9,000 left of ₹15,000" },
      { label: "Vendor / category sanity", ok: true, detail: "Sports equipment" },
    ],
  },
  {
    id: "BC-2035", name: "Kavya Iyer", dept: "Design", initials: "KI", category: "Learning",
    claimed: 12500, extracted: 12500, vendor: "O’Reilly Media", date: "09 Jun 2026", confidence: "Medium (78%)",
    flags: ["Vendor unclear"],
    checks: [
      { label: "File readable", ok: true, detail: "PDF, 0.5 MB" },
      { label: "Not a duplicate", ok: true, detail: "No prior match" },
      { label: "Amount matches receipt", ok: true, detail: "₹12,500" },
      { label: "Within FY 2026–27", ok: true, detail: "09 Jun 2026" },
      { label: "Balance sufficient", ok: true, detail: "₹40,000 left" },
      { label: "Vendor / category sanity", ok: false, detail: "Could not classify vendor" },
    ],
  },
  {
    id: "BC-2030", name: "Rahul Verma", dept: "Engineering", initials: "RV", category: "Sports",
    claimed: 8500, extracted: 8500, vendor: "Cult.fit", date: "02 Jun 2026", confidence: "Low (58%)",
    flags: ["Low OCR"],
    checks: [
      { label: "File readable", ok: true, detail: "PNG, 2.1 MB" },
      { label: "Not a duplicate", ok: true, detail: "No prior match" },
      { label: "Amount matches receipt", ok: true, detail: "₹8,500 (low confidence)" },
      { label: "Within FY 2026–27", ok: true, detail: "02 Jun 2026" },
      { label: "Balance sufficient", ok: true, detail: "₹15,000 left" },
      { label: "Vendor / category sanity", ok: true, detail: "Gym membership" },
    ],
  },
  {
    id: "BC-2028", name: "Meera Joshi", dept: "HR", initials: "MJ", category: "Learning",
    claimed: 30000, extracted: 30000, vendor: "Coursera Plus", date: "28 May 2026", confidence: "High (91%)",
    flags: ["Duplicate suspected"],
    checks: [
      { label: "File readable", ok: true, detail: "PDF, 0.9 MB" },
      { label: "Not a duplicate", ok: false, detail: "Matches BC-1990 hash" },
      { label: "Amount matches receipt", ok: true, detail: "₹30,000" },
      { label: "Within FY 2026–27", ok: true, detail: "28 May 2026" },
      { label: "Balance sufficient", ok: true, detail: "₹45,000 left" },
      { label: "Vendor / category sanity", ok: true, detail: "Online course" },
    ],
  },
];

// Flags that represent a hard failure (red) vs a soft warning (amber).
export const HARD_FLAGS = new Set(["Over balance", "Duplicate suspected", "Amount mismatch"]);
