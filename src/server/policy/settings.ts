// KAN-46 — DB-backed loader/saver for the approval policy (server-only). Reads
// the single `approval_policy` row and maps it to the pure ApprovalPolicy type;
// callers in the request path use loadApprovalPolicy(), the config screen uses
// saveApprovalPolicy() (HR/Admin only). All balance-free config — no AuditLog
// rule applies, but every save writes an audit_log row for traceability.
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalPolicy, auditLog, type ApprovalPolicyRow } from "@/db/schema";
import {
  DEFAULT_APPROVAL_POLICY,
  normaliseCcEmails,
  type ApprovalPolicy,
} from "./approval-policy";

const POLICY_ID = "default";

/** Map a raw DB row (numeric as string) to the pure, typed policy. */
function toPolicy(row: ApprovalPolicyRow): ApprovalPolicy {
  return {
    routingMode: row.routingMode,
    wfhAutoApproveMaxDays: Number(row.wfhAutoApproveMaxDays),
    ccEmails: Array.isArray(row.ccEmails) ? row.ccEmails : [],
    requireLeaveCancellationApproval: row.requireLeaveCancellationApproval,
  };
}

/**
 * The active approval policy. Falls back to DEFAULT_APPROVAL_POLICY when no row
 * exists yet (HR hasn't configured anything) — never throws in the request path.
 */
export async function loadApprovalPolicy(): Promise<ApprovalPolicy> {
  const db = getDb();
  const [row] = await db.select().from(approvalPolicy).where(eq(approvalPolicy.id, POLICY_ID)).limit(1);
  return row ? toPolicy(row) : DEFAULT_APPROVAL_POLICY;
}

/** Upsert the single policy row + audit the change. Returns the stored policy. */
export async function saveApprovalPolicy(params: {
  actorId: string;
  routingMode: ApprovalPolicy["routingMode"];
  wfhAutoApproveMaxDays: number;
  ccEmails: string[];
  requireLeaveCancellationApproval: boolean;
}): Promise<ApprovalPolicy> {
  const db = getDb();
  const ccEmails = normaliseCcEmails(params.ccEmails);
  const wfhAutoApproveMaxDays = Math.max(0, params.wfhAutoApproveMaxDays);

  const values = {
    id: POLICY_ID,
    routingMode: params.routingMode,
    wfhAutoApproveMaxDays: String(wfhAutoApproveMaxDays),
    ccEmails,
    requireLeaveCancellationApproval: params.requireLeaveCancellationApproval,
    updatedAt: new Date(),
    updatedBy: params.actorId,
  };

  const [row] = await db
    .insert(approvalPolicy)
    .values(values)
    .onConflictDoUpdate({
      target: approvalPolicy.id,
      set: {
        routingMode: values.routingMode,
        wfhAutoApproveMaxDays: values.wfhAutoApproveMaxDays,
        ccEmails: values.ccEmails,
        requireLeaveCancellationApproval: values.requireLeaveCancellationApproval,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();

  await db.insert(auditLog).values({
    actorId: params.actorId,
    action: "update_approval_policy",
    entity: "approval_policy",
    entityId: POLICY_ID,
    payload: { routingMode: values.routingMode, wfhAutoApproveMaxDays, ccEmails, requireLeaveCancellationApproval: values.requireLeaveCancellationApproval },
  });

  return toPolicy(row);
}
