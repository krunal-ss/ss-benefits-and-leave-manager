export const PENDING_STATUSES = ["applied", "pending_l1", "pending_l2"];

export const STATUS_CLS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-500",
  pending_l1: "bg-amber-500/15 text-amber-700",
  pending_l2: "bg-amber-500/15 text-amber-700",
  applied: "bg-amber-500/15 text-amber-700",
  rejected: "bg-red-500/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
