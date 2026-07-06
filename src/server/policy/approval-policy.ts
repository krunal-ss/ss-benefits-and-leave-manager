// KAN-46 — Approval-policy engine (PURE). No DB / server-only imports so the
// routing decision is unit-testable without a database (see approval-policy.test.ts).
// The thin DB-backed loader/saver lives in settings.ts; the server actions
// (applyLeaveAction / decideLeaveAction) consult decideRouting() below.

/** Typed, defaulted view of an `approvalPolicy` row (numerics as numbers). */
export type ApprovalPolicy = {
  /** sequential = TL(L1) then PM(L2); parallel = both notified at once. */
  routingMode: "sequential" | "parallel";
  /** Auto-approve WFH of at most N working days. 0 disables auto-approve entirely. */
  wfhAutoApproveMaxDays: number;
  /** Extra recipients CC'd on routing/decision notifications. */
  ccEmails: string[];
  /** KAN-127 — whether cancelling an approved leave needs the approver's sign-off. */
  requireLeaveCancellationApproval: boolean;
};

/** Safe fallback used before HR configures anything (matches schema defaults). */
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  routingMode: "sequential",
  wfhAutoApproveMaxDays: 0,
  ccEmails: [],
  requireLeaveCancellationApproval: true,
};

export type RequestKind = "leave" | "wfh";

/** The routing outcome for a freshly-applied request. */
export type RoutingDecision =
  /** Skip approvers entirely — record as approved (still audited by the caller). */
  | { outcome: "auto_approved"; reason: string }
  /** Sequential: TL first (L1), status pending_l1, currentLevel 1. */
  | { outcome: "sequential"; status: "pending_l1"; currentLevel: 1 }
  /** Parallel: both approvers notified at once; first pending stage is L1. */
  | { outcome: "parallel"; status: "pending_l1"; currentLevel: 1 };

/**
 * Decide how a newly-applied request should be routed, given the active policy.
 *
 * Hard rule: auto-approve ONLY for WFH (which never deducts a balance) and only
 * when the request is within the configured threshold. Balance-deducting leave
 * is NEVER auto-approved here — it always goes to approvers so the deduction is
 * an explicit, audited final approval.
 */
export function decideRouting(params: {
  kind: RequestKind;
  /** Whether this request draws down a leave balance (always false for WFH). */
  deductsBalance: boolean;
  /** Working days requested (may be fractional for half-days). */
  workingDays: number;
  policy: ApprovalPolicy;
}): RoutingDecision {
  const { kind, deductsBalance, workingDays, policy } = params;
  const threshold = Math.max(0, policy.wfhAutoApproveMaxDays);

  // Auto-approve is WFH-only, non-balance-deducting, threshold > 0, within limit.
  if (
    kind === "wfh" &&
    !deductsBalance &&
    threshold > 0 &&
    workingDays > 0 &&
    workingDays <= threshold
  ) {
    return {
      outcome: "auto_approved",
      reason: `WFH ≤ ${threshold} working day(s) — auto-approved per policy`,
    };
  }

  if (policy.routingMode === "parallel") {
    return { outcome: "parallel", status: "pending_l1", currentLevel: 1 };
  }
  return { outcome: "sequential", status: "pending_l1", currentLevel: 1 };
}

/**
 * After an L1 approval, does the request still need a second (L2) approval?
 * - sequential → yes (advance to pending_l2).
 * - parallel   → no (a single approval finalises it).
 */
export function requiresSecondLevel(policy: ApprovalPolicy): boolean {
  return policy.routingMode === "sequential";
}

/** Normalise a raw list of CC entries: trim, drop blanks, lowercase, dedupe. */
export function normaliseCcEmails(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Basic email shape check for the config form (not RFC-exhaustive, intentionally). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
