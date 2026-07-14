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
  uniqueIndex,
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
  // KAN-127 — a cancellation request against an already-`approved` leave,
  // awaiting the approver's sign-off (only used when the policy requires it;
  // an immediate cancellation goes straight to "cancelled").
  "cancellation_requested",
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
  // Nullable so a `draft` claim (KAN-125) can exist with only some fields
  // filled in — required-ness of these three is enforced at the application
  // layer only when a draft transitions to `submitted`.
  categoryId: uuid().references(() => benefitCategories.id),
  amountPaise: integer(),
  expenseDate: date(),
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

// ---- KAN-126: Claim Resubmission. A `rejected` claim can be edited and
// resubmitted under the SAME `benefitClaims` row (no new claim). Each
// resubmission snapshots the PRE-EDIT state here before applying the edit, so
// `rejected` is no longer a terminal/dead-end status — see resubmit-claim.ts.
// The claim's current "version number" is derived as (row count for this
// claimId here) + 1, never stored redundantly on `benefitClaims` itself.
export const benefitClaimVersions = pgTable("benefit_claim_versions", {
  id: uuid().primaryKey().defaultRandom(),
  claimId: uuid()
    .notNull()
    .references(() => benefitClaims.id, { onDelete: "cascade" }),
  versionNumber: integer().notNull(),
  amountPaise: integer(),
  categoryId: uuid().references(() => benefitCategories.id),
  expenseDate: date(),
  vendor: text(),
  documentUrl: text(),
  documentHash: text(),
  status: claimStatusEnum().notNull(),
  decisionReason: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
// ---- end KAN-126 ----

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
  // ---- KAN-187 (Leave Policy Viewer) content, editable by HR Head/Admin at
  // /settings/leave-policy. All nullable/defaulted so existing rows keep
  // working with no backfill; the viewer shows an empty section until HR
  // fills it in. See src/server/policy.ts.
  summary: text(),
  eligibility: jsonb().$type<string[]>().notNull().default([]),
  approver: text(),
  noticeText: text(),
  encashText: text(),
  carryHeadline: text(),
  carryText: text(),
  processSteps: jsonb().$type<string[]>().notNull().default([]),
  faqs: jsonb().$type<{ q: string; a: string }[]>().notNull().default([]),
  // ---- end KAN-187 ----
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
  // KAN-127 — set when a cancellation request/decision has happened; null otherwise.
  cancellationReason: text(),
  cancelledAt: timestamp({ withTimezone: true }),
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
  // KAN-127 — whether cancelling an already-approved leave needs the original
  // approver's sign-off. When false, cancellation is immediate.
  requireLeaveCancellationApproval: boolean().notNull().default(true),
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

// ---- KAN-148: Remaining Benefit Reminder config (HR Head / Admin). One
// single-row settings table (id defaults to "default", same "lazily default
// if missing" pattern as approvalPolicy) driving both the employee dashboard
// banner and the HR "Benefit reminders" settings screen. leadDaysBeforeFyEnd
// holds which of the fixed 90/60/30/14/7-day checkpoints are enabled; the
// actual per-employee scheduled email fan-out (a cron job reading this row)
// is intentionally NOT part of this pass — see KAN-160.
export const reminderFrequencyEnum = pgEnum("reminder_frequency", ["once", "weekly", "daily"]);

export const benefitReminderSettings = pgTable("benefit_reminder_settings", {
  id: text().primaryKey().default("default"),
  leadDaysBeforeFyEnd: jsonb().$type<number[]>().notNull().default([90, 60, 30, 7]),
  frequency: reminderFrequencyEnum().notNull().default("weekly"),
  dashboardEnabled: boolean().notNull().default(true),
  emailEnabled: boolean().notNull().default(true),
  // Rupees in the design mock, but stored in PAISE per this repo's money convention.
  thresholdPaise: integer().notNull().default(500000),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id),
});

export type BenefitReminderSettingsRow = typeof benefitReminderSettings.$inferSelect;
// ---- end KAN-148 ----

// ---- KAN-168: Notification Preferences (Employee Productivity Enhancements
// epic, KAN-165). PER-USER row (unlike the single-row config tables above) —
// one per `users.id`, lazily created with defaults on first read (see
// src/server/notifications/preferences.ts). Scope for this pass is
// intentionally limited to (a) capturing the preference and (b) enforcing it
// for the EMAIL channel only. `pushEnabled`/`inAppEnabled` are recorded here
// so the UI/schema are future-proof, but there is no push delivery (no
// web-push/service worker/VAPID) or in-app notification center yet — they are
// not read by any send path today.
// Quiet hours are stored as "HH:MM" 24h wall-clock strings in IST (this org is
// India-based), nullable — null on either means quiet hours are OFF. The
// window may wrap midnight (e.g. "22:00" -> "07:00"); see isWithinQuietHours.
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id),
  emailEnabled: boolean().notNull().default(true),
  pushEnabled: boolean().notNull().default(true),
  inAppEnabled: boolean().notNull().default(true),
  quietHoursStart: text(), // "HH:MM", IST wall-clock; null = no quiet hours
  quietHoursEnd: text(), // "HH:MM", IST wall-clock; null = no quiet hours
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;
// ---- end KAN-168 ----

// ---- KAN-187: Leave Policy Viewer — the company-wide policy PDF. One
// single-row settings table (same lazily-defaulted pattern as approvalPolicy),
// storing only the PRIVATE-bucket object path (never a public URL — see
// getPolicyDocumentSignedUrl in src/server/supabase/storage.ts).
export const leavePolicyDocument = pgTable("leave_policy_document", {
  id: text().primaryKey().default("default"),
  documentPath: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id),
});

export type LeavePolicyDocumentRow = typeof leavePolicyDocument.$inferSelect;
// ---- end KAN-187 ----

// KAN-207 — a user's saved/pinned expense vendors, used to power submit-form
// suggestions. usageCount increments on claim finalize (verifyAndScoreClaim),
// never on draft save.
export const favoriteVendors = pgTable(
  "favorite_vendors",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references((): AnyPgColumn => users.id),
    vendorName: text().notNull(),
    // Lower-cased/trimmed form of vendorName, unique per user — lets recordVendorUsage
    // upsert atomically (onConflictDoUpdate) and treats "Cult.fit"/"cult.fit" as one vendor.
    vendorKey: text().notNull(),
    usageCount: integer().notNull().default(0),
    pinned: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("favorite_vendors_user_vendor_key_idx").on(table.userId, table.vendorKey)],
);

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
