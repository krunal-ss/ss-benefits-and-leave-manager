// Client-safe shapes + constants for the HR expense queue (no server-only deps,
// so the queue UI can import them). The DB queries live in ./expenses.ts.
import type { AiVerdict } from "@/server/verification";

export type RuleCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type QueuedClaim = {
  id: string; // claim uuid — the value the decision action acts on
  ref: string; // short human-readable reference, e.g. "BC-9F3A2C"
  name: string;
  dept: string;
  initials: string;
  category: string;
  claimed: number; // rupees
  extracted: number; // rupees (OCR/extracted amount used during verification)
  vendor: string;
  date: string;
  confidence: string; // e.g. "High (96%)"
  flags: string[];
  checks: RuleCheck[];
  /** KAN-126 — 1 for a never-resubmitted claim; N = (prior versions) + 1. */
  version: number;
  /** KAN-113 — explainable AI score/verdict, computed once at submission (KAN-111/115). */
  aiScore: number;
  aiVerdict: AiVerdict;
  /** KAN-147 — ISO timestamp; the SLA clock's start. Raw, not pre-computed, so `<SlaBadge>` can tick it live client-side. */
  createdAt: string;
};

// Flags that represent a hard failure (red) vs a soft warning (amber).
export const HARD_FLAGS = new Set(["Over balance", "Duplicate suspected", "Amount mismatch"]);
