import { cn } from "@/lib/cn";
import type { EventApproval } from "@/server/calendar";

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Sequential-flow approval state for one level, derived from status + the approvals trail. */
function levelState(
  level: 1 | 2,
  status: string,
  approval: EventApproval | undefined,
): "approved" | "rejected" | "pending" | "not-reached" {
  if (approval) return approval.decision;
  if (level === 1) return status === "applied" || status === "pending_l1" ? "pending" : "not-reached";
  return status === "pending_l2" ? "pending" : "not-reached";
}

export function LevelRow({
  level,
  roleLabel,
  approverName,
  status,
  approval,
}: {
  level: 1 | 2;
  roleLabel: string;
  approverName: string | null;
  status: string;
  approval: EventApproval | undefined;
}) {
  const state = levelState(level, status, approval);
  const dot =
    state === "approved"
      ? "border-emerald-500 bg-emerald-500 text-white"
      : state === "rejected"
        ? "border-destructive bg-destructive text-white"
        : state === "pending"
          ? "border-amber-500 bg-amber-500 text-white"
          : "border-border bg-muted text-muted-foreground";
  const mark = state === "approved" ? "✓" : state === "rejected" ? "✕" : state === "pending" ? "•" : level;

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
          dot,
        )}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[13px] font-medium">
            L{level} · {roleLabel}
          </span>
          <span className="text-[12px] text-muted-foreground">{approverName ?? "—"}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {state === "approved" && `Approved${approval ? ` · ${fmtTimestamp(approval.createdAt)}` : ""}`}
          {state === "rejected" && `Rejected${approval ? ` · ${fmtTimestamp(approval.createdAt)}` : ""}`}
          {state === "pending" && "Awaiting decision"}
          {state === "not-reached" && "Not yet reached"}
        </div>
        {approval?.reason && <p className="mt-1 text-[12px] whitespace-pre-wrap italic">&ldquo;{approval.reason}&rdquo;</p>}
      </div>
    </div>
  );
}
