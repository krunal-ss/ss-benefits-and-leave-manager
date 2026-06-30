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

// ---- Module B: Leave & WFH ----
export const leaveTypes = pgTable("leave_types", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(), // CL, SL, EL, LOP
  name: text().notNull(),
  accrualRule: text(), // free-form policy descriptor for v1
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
export type NewUser = typeof users.$inferInsert;
export type BenefitClaim = typeof benefitClaims.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
