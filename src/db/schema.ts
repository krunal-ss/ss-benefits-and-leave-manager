// Drizzle schema — models the PRD §10 data model.
// Money is stored as integer PAISE (never floats). Leave balances/days are
// fractional (half-days) so they use numeric. Reporting lines are DATA here
// (teamLeadId / projectManagerId), never hard-coded routing.

import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---- enums ----
export const roleEnum = pgEnum("role", [
  "employee",
  "team_lead",
  "project_manager",
  "hr_head",
  "admin",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "draft",
  "submitted",
  "auto_approved",
  "pending_hr",
  "approved",
  "rejected",
  "reimbursed",
]);

export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "applied",
  "pending_l1",
  "pending_l2",
  "approved",
  "rejected",
  "cancelled",
]);

export const requestKindEnum = pgEnum("request_kind", ["leave", "wfh"]);
export const decisionEnum = pgEnum("decision", ["approved", "rejected"]);

// KAN-111 — AI Expense Verification & Receipt Intelligence.
export const receiptVerdictEnum = pgEnum("receipt_verdict", ["approve", "review", "reject"]);

// ---- core ----
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: roleEnum().notNull().default("employee"),
  // Reporting line (configurable data, not hard-coded).
  teamLeadId: uuid().references((): AnyPgColumn => users.id),
  projectManagerId: uuid().references((): AnyPgColumn => users.id),
  department: text(),
  // KAN-77 — flags a sole/critical-skill holder (e.g. the only person who can
  // deploy, or the only DBA on a team). Consulted by the staffing guard to warn
  // when their leave/WFH would leave the team without ANY available critical-role
  // holder for a day. HR/Admin-managed; defaults false for every existing user.
  isCriticalRole: boolean().notNull().default(false),
  joinDate: date(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---- Module A: Benefit Wallet ----
export const benefitCategories = pgTable("benefit_categories", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  annualCapPaise: integer().notNull(),
  fyStart: text().notNull().default("04-01"), // MM-DD; default 1 Apr
  carryover: boolean().notNull().default(false),
});

export type VerificationResult = {
  passed: boolean;
  checks: { label: string; ok: boolean; detail: string }[];
  ocrConfidence?: number;
  // OCR-extracted receipt fields (KAN-42) — surfaced to HR for a fast decision.
  extracted?: {
    amountPaise: number | null;
    date: string | null;
    vendor: string | null;
  };
};

export const benefitClaims = pgTable("benefit_claims", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  categoryId: uuid()
    .notNull()
    .references(() => benefitCategories.id),
  amountPaise: integer().notNull(),
  expenseDate: date().notNull(),
  vendor: text(),
  documentUrl: text(),
  documentHash: text(), // dedupe via hash (AC2)
  status: claimStatusEnum().notNull().default("submitted"),
  verificationResult: jsonb().$type<VerificationResult>(),
  approverId: uuid().references(() => users.id),
  decisionReason: text(),
  fy: text().notNull(), // e.g. "2026-27"
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---- KAN-111: AI Expense Verification & Receipt Intelligence ----
// Additive to `benefitClaims.verificationResult` (the pass/fail rule outcomes,
// untouched by this feature): one row per claim holding the explainable AI
// score, the fraud/anomaly signals, and any duplicate match, for the HR-facing
// "Receipt Intelligence" screen. Computed once at submission time (KAN-115).
export type AiScoreFactor = { label: string; delta: number; positive: boolean };
export type FraudSignal = { label: string; detail: string; severity: "ok" | "warn" | "high" };
export type DuplicateMatch = { claimId: string; similarityPercent: number; note: string };
// Per-field OCR readout (PRD "Database" section calls for OCR data alongside
// the AI score) — confidencePercent is 0-100, pre-rounded for direct display.
export type OcrField = { label: string; value: string; confidencePercent: number };

export const receiptVerifications = pgTable("receipt_verifications", {
  id: uuid().primaryKey().defaultRandom(),
  // cascade: deleting a claim (an employee may delete their own while pending_hr,
  // see delete-claim.ts) must delete its receipt-intelligence row too — nothing
  // may block or orphan a claim delete.
  claimId: uuid()
    .notNull()
    .unique()
    .references(() => benefitClaims.id, { onDelete: "cascade" }),
  aiScore: integer().notNull(),
  verdict: receiptVerdictEnum().notNull(),
  verdictReason: text().notNull(),
  factors: jsonb().$type<AiScoreFactor[]>().notNull().default([]),
  fraudSignals: jsonb().$type<FraudSignal[]>().notNull().default([]),
  duplicateMatch: jsonb().$type<DuplicateMatch | null>(),
  ocrFields: jsonb().$type<OcrField[]>().notNull().default([]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
// ---- end KAN-111 ----

// ---- Module B: Leave & WFH ----
export const leaveTypes = pgTable("leave_types", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(), // CL, SL, EL, LOP
  name: text().notNull(),
  accrualRule: text(), // free-form human-readable policy descriptor
  // ---- KAN-43: structured accrual config (read by src/server/leave/accrual.ts) ----
  // Days credited each accrual period (monthly). 0 = no periodic accrual.
  accrualPerMonthDays: numeric({ precision: 5, scale: 2 }).notNull().default("0"),
  // Days granted up-front at the start of the FY (before any accrual).
  openingBalanceDays: numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  // ---- end KAN-43 additions ----
  maxBalanceDays: numeric({ precision: 5, scale: 1 }),
  carryForward: boolean().notNull().default(false),
  deductsBalance: boolean().notNull().default(true),
});

export const leaveBalances = pgTable("leave_balances", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  leaveTypeId: uuid()
    .notNull()
    .references(() => leaveTypes.id),
  balanceDays: numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  fy: text().notNull(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  kind: requestKindEnum().notNull().default("leave"),
  leaveTypeId: uuid().references(() => leaveTypes.id), // null for WFH
  fromDate: date().notNull(),
  toDate: date().notNull(),
  halfDay: boolean().notNull().default(false),
  workingDays: numeric({ precision: 5, scale: 1 }).notNull(),
  reason: text(),
  status: leaveRequestStatusEnum().notNull().default("applied"),
  currentLevel: integer().notNull().default(1),
  // Approvers chosen by the applicant at submit time — the request carries its own
  // routing snapshot (L1 = Team Lead, L2 = Project Manager), independent of the
  // applicant's stored reporting line.
  teamLeadId: uuid().references((): AnyPgColumn => users.id),
  projectManagerId: uuid().references((): AnyPgColumn => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable("approvals", {
  id: uuid().primaryKey().defaultRandom(),
  requestId: uuid()
    .notNull()
    .references(() => leaveRequests.id),
  level: integer().notNull(),
  approverId: uuid()
    .notNull()
    .references(() => users.id),
  decision: decisionEnum().notNull(),
  reason: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---- KAN-46: approval-policy config (single-row settings table) ----
// HR/Admin-configurable routing + notification policy consulted by
// applyLeaveAction / decideLeaveAction (src/server/policy/). One row per install
// (id defaults to "default"); columns map 1:1 to the pure ApprovalPolicy type.
export const routingModeEnum = pgEnum("routing_mode", ["sequential", "parallel"]);

export const approvalPolicy = pgTable("approval_policy", {
  id: text().primaryKey().default("default"),
  // Sequential = TL (L1) then PM (L2); parallel = both notified at once, either can act.
  routingMode: routingModeEnum().notNull().default("sequential"),
  // Auto-approve WFH requests of at most this many working days (0 = never auto-approve).
  // Never applies to balance-deducting leave — those always route to approvers.
  wfhAutoApproveMaxDays: numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  // Extra recipients CC'd on every routing/decision notification email.
  ccEmails: jsonb().$type<string[]>().notNull().default([]),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id),
});

export type ApprovalPolicyRow = typeof approvalPolicy.$inferSelect;
// ---- end KAN-46 ----

// ---- KAN-74: staffing threshold config (Smart Team Availability & Capacity
// Planner epic). HR/Admin-configurable minimum "% of team available" — one
// org-wide default row (scope="org", scopeValue=null) plus optional
// department overrides (scope="department", scopeValue=<department name>).
// Consulted later in the epic to warn approvers when a leave/WFH request
// would drop a team below the configured percentage.
export const staffingThresholdScopeEnum = pgEnum("staffing_threshold_scope", ["org", "department"]);

export const staffingThreshold = pgTable("staffing_threshold", {
  id: uuid().primaryKey().defaultRandom(),
  scope: staffingThresholdScopeEnum().notNull(),
  // Department name (free text, matches users.department); null for the org-wide row.
  scopeValue: text(),
  minAvailablePercent: integer().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id),
});

export type StaffingThreshold = typeof staffingThreshold.$inferSelect;
// ---- end KAN-74 ----

// ---- KAN-79: capacity-forecast snapshots (Smart Team Availability & Capacity
// Planner epic). The 2-4 week forward-looking trend on /availability is
// computed LIVE from leaveRequests — this table is NOT read by that forecast.
// It persists a daily point-in-time snapshot per scope (org, department, team),
// building up real HISTORICAL trend data over time. Populated by the Vercel
// Cron job at src/app/api/cron/capacity-snapshot/route.ts (see vercel.json),
// which calls src/server/manager/capacity-snapshot-job.ts once a day — a
// future story must still add the UI that reads this table's history.
export const teamCapacitySnapshot = pgTable("team_capacity_snapshot", {
  id: uuid().primaryKey().defaultRandom(),
  date: date().notNull(),
  // 'team' (scopeId = a manager's user id) | 'department' (scopeId = department name) | 'org' (scopeId = null).
  scopeType: text().notNull(),
  scopeId: text(),
  totalHeadcount: integer().notNull(),
  // Numeric, not integer — half-day leave produces fractional counts (e.g. 3.5), same convention as leaveBalances.
  availableCount: numeric({ precision: 6, scale: 1 }).notNull(),
  capacityPercent: integer().notNull(),
  computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// ---- end KAN-79 ----

// ---- shared ----
export const holidays = pgTable("holidays", {
  id: uuid().primaryKey().defaultRandom(),
  date: date().notNull(),
  name: text().notNull(),
  location: text(),
});

export const emailLog = pgTable("email_log", {
  id: uuid().primaryKey().defaultRandom(),
  toAddress: text().notNull(),
  subject: text().notNull(),
  template: text(),
  status: text().notNull().default("queued"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Immutable trail of who-did-what (hard rule: balance changes write an AuditLog).
export const auditLog = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  actorId: uuid().references(() => users.id),
  action: text().notNull(),
  entity: text().notNull(),
  entityId: text(),
  payload: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type LeaveType = typeof leaveTypes.$inferSelect;
