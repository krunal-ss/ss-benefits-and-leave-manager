import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { VERDICT_META } from "@/lib/verdict-style";
import type { AiVerdict } from "@/server/verification";

/** Compact "AI score" pill for the HR queue table / review drawer (KAN-113). Click target for callers that link to the full Receipt Intelligence screen. */
export function AiScoreBadge({ score, verdict, className }: { score: number; verdict: AiVerdict; className?: string }) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold", meta.bg, className)}
      style={{ color: meta.color }}
    >
      <ShieldCheck className="size-[13px] shrink-0" strokeWidth={2} />
      <span className="tabular">{score}</span>
    </span>
  );
}
