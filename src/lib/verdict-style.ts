import type { AiVerdict } from "@/server/verification";

// KAN-113 — shared verdict → color/label mapping so the queue badge, review
// drawer, and Receipt Intelligence screen never drift out of sync.
export const VERDICT_META: Record<AiVerdict, { label: string; color: string; bg: string }> = {
  approve: { label: "Recommend approve", color: "var(--emerald-500)", bg: "bg-emerald-500/10" },
  review: { label: "Needs human review", color: "#b45309", bg: "bg-amber-500/[0.11]" },
  reject: { label: "Recommend reject", color: "var(--destructive)", bg: "bg-red-500/[0.1]" },
};
