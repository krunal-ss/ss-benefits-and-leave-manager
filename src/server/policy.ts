// KAN-187 — Leave Policy Viewer. Eligibility/carry-forward/FAQ content is
// DB-backed per real leave type (CL/SL/EL — the ones an employee actually
// applies for; LOP is an automatic fallback, not a policy to browse, so it's
// excluded the same way dashboard.ts's leave cards exclude it). Work From
// Home has no `leaveTypes` row (WFH requests never set `leaveTypeId`, see
// schema.ts) and no leave_balances concept, so its policy card is static,
// computed content here rather than a DB row HR can edit — an intentional
// scope decision, not an oversight.
import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, leaveTypes, leavePolicyDocument, type LeaveType } from "@/db/schema";
import { getPolicyDocumentSignedUrl } from "@/server/supabase/storage";

export type PolicyFaq = { q: string; a: string };

export type LeavePolicy = {
  id: string; // leaveTypeId, or "wfh" for the static card
  code: string;
  name: string;
  summary: string;
  annual: string;
  accrual: string;
  approver: string;
  notice: string;
  encash: string;
  eligibility: string[];
  carryAllowed: boolean;
  carryHeadline: string;
  carryText: string;
  process: string[];
  faqs: PolicyFaq[];
  editable: boolean;
};

/** DB-backed leave types shown in the viewer, in display order. */
const POLICY_CODES = ["CL", "SL", "EL"] as const;

function toPolicy(row: LeaveType): LeavePolicy {
  const max = row.maxBalanceDays ? Number(row.maxBalanceDays) : null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    summary: row.summary ?? "",
    annual: max ? `${max} days / year` : "As configured",
    accrual: row.accrualRule ?? "",
    approver: row.approver ?? "Reporting manager",
    notice: row.noticeText ?? "",
    encash: row.encashText ?? "Not encashable",
    eligibility: row.eligibility ?? [],
    carryAllowed: row.carryForward,
    carryHeadline: row.carryHeadline ?? (row.carryForward ? "Carries forward" : "Does not carry forward"),
    carryText: row.carryText ?? "",
    process: row.processSteps ?? [],
    faqs: row.faqs ?? [],
    editable: true,
  };
}

const WFH_MONTHLY_QUOTA_DAYS = 8; // mirrors src/server/employee/dashboard.ts's WFH_MONTHLY_QUOTA

const WFH_POLICY: LeavePolicy = {
  id: "wfh",
  code: "WFH",
  name: "Work From Home",
  summary: "Remote working days that do not use leave.",
  annual: `${WFH_MONTHLY_QUOTA_DAYS} days / month`,
  accrual: "Resets monthly — does not accumulate",
  approver: "Reporting manager",
  notice: "Apply 1 day in advance where possible",
  encash: "Not applicable",
  eligibility: [
    "All employees whose role supports remote work.",
    "Subject to team coverage and manager discretion.",
  ],
  carryAllowed: false,
  carryHeadline: "Resets every month",
  carryText: `The ${WFH_MONTHLY_QUOTA_DAYS}-day monthly allowance does not carry forward. Unused WFH days simply reset on the 1st of each month.`,
  process: [
    "Open Apply leave / WFH and choose Work From Home",
    "Pick your remote days",
    "Manager approves — no leave balance is deducted",
  ],
  faqs: [
    { q: "Does WFH reduce my leave balance?", a: "No. Work-from-home days are tracked separately and never deduct from any leave balance." },
    { q: "Can I take more than the monthly WFH allowance?", a: "Additional days need explicit manager approval and are granted case by case." },
  ],
  editable: false,
};

/** All policies for the viewer's list screen, DB-backed types first, WFH last. */
export async function getLeavePolicies(): Promise<LeavePolicy[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(leaveTypes)
    .where(inArray(leaveTypes.code, [...POLICY_CODES]));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const ordered = POLICY_CODES.map((c) => byCode.get(c)).filter((r): r is LeaveType => Boolean(r)).map(toPolicy);
  return [...ordered, WFH_POLICY];
}

export async function getLeavePolicy(id: string): Promise<LeavePolicy | null> {
  if (id === "wfh") return WFH_POLICY;
  const db = getDb();
  const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id)).limit(1);
  return row ? toPolicy(row) : null;
}

/** HR-only content update for one DB-backed leave type. Caller must have already checked `configurePolicy`. */
export async function updateLeavePolicyContent(params: {
  actorId: string;
  leaveTypeId: string;
  summary: string;
  eligibility: string[];
  approver: string;
  notice: string;
  encash: string;
  carryHeadline: string;
  carryText: string;
  process: string[];
  faqs: PolicyFaq[];
}): Promise<LeavePolicy> {
  const db = getDb();
  const [row] = await db
    .update(leaveTypes)
    .set({
      summary: params.summary,
      eligibility: params.eligibility,
      approver: params.approver,
      noticeText: params.notice,
      encashText: params.encash,
      carryHeadline: params.carryHeadline,
      carryText: params.carryText,
      processSteps: params.process,
      faqs: params.faqs,
    })
    .where(eq(leaveTypes.id, params.leaveTypeId))
    .returning();
  if (!row) throw new Error("Leave type not found.");

  await db.insert(auditLog).values({
    actorId: params.actorId,
    action: "update_leave_policy_content",
    entity: "leave_type",
    entityId: params.leaveTypeId,
    payload: { code: row.code },
  });

  return toPolicy(row);
}

const DOCUMENT_ID = "default";

/** Signed download URL for the current policy PDF, or null if none uploaded / storage unavailable. */
export async function getLeavePolicyDocumentUrl(): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(leavePolicyDocument)
    .where(eq(leavePolicyDocument.id, DOCUMENT_ID))
    .limit(1);
  if (!row?.documentPath) return null;
  return getPolicyDocumentSignedUrl(row.documentPath);
}

/** HR-only: record the newly-uploaded PDF's storage path + audit the change. */
export async function replaceLeavePolicyDocument(params: { actorId: string; path: string }): Promise<void> {
  const db = getDb();
  await db
    .insert(leavePolicyDocument)
    .values({ id: DOCUMENT_ID, documentPath: params.path, updatedAt: new Date(), updatedBy: params.actorId })
    .onConflictDoUpdate({
      target: leavePolicyDocument.id,
      set: { documentPath: params.path, updatedAt: new Date(), updatedBy: params.actorId },
    });

  await db.insert(auditLog).values({
    actorId: params.actorId,
    action: "replace_leave_policy_document",
    entity: "leave_policy_document",
    entityId: DOCUMENT_ID,
    payload: { path: params.path },
  });
}
