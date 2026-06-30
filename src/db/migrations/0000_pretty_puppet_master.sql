CREATE TYPE "public"."claim_status" AS ENUM('draft', 'submitted', 'auto_approved', 'pending_hr', 'approved', 'rejected', 'reimbursed');--> statement-breakpoint
CREATE TYPE "public"."decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('applied', 'pending_l1', 'pending_l2', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."request_kind" AS ENUM('leave', 'wfh');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('employee', 'team_lead', 'project_manager', 'hr_head', 'admin');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestId" uuid NOT NULL,
	"level" integer NOT NULL,
	"approverId" uuid NOT NULL,
	"decision" "decision" NOT NULL,
	"reason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorId" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entityId" text,
	"payload" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefit_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"annualCapPaise" integer NOT NULL,
	"fyStart" text DEFAULT '04-01' NOT NULL,
	"carryover" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefit_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"categoryId" uuid NOT NULL,
	"amountPaise" integer NOT NULL,
	"expenseDate" date NOT NULL,
	"vendor" text,
	"documentUrl" text,
	"documentHash" text,
	"status" "claim_status" DEFAULT 'submitted' NOT NULL,
	"verificationResult" jsonb,
	"approverId" uuid,
	"decisionReason" text,
	"fy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"toAddress" text NOT NULL,
	"subject" text NOT NULL,
	"template" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"location" text
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"leaveTypeId" uuid NOT NULL,
	"balanceDays" numeric(5, 1) DEFAULT '0' NOT NULL,
	"fy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"kind" "request_kind" DEFAULT 'leave' NOT NULL,
	"leaveTypeId" uuid,
	"fromDate" date NOT NULL,
	"toDate" date NOT NULL,
	"halfDay" boolean DEFAULT false NOT NULL,
	"workingDays" numeric(5, 1) NOT NULL,
	"reason" text,
	"status" "leave_request_status" DEFAULT 'applied' NOT NULL,
	"currentLevel" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"accrualRule" text,
	"maxBalanceDays" numeric(5, 1),
	"carryForward" boolean DEFAULT false NOT NULL,
	"deductsBalance" boolean DEFAULT true NOT NULL,
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'employee' NOT NULL,
	"teamLeadId" uuid,
	"projectManagerId" uuid,
	"department" text,
	"joinDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestId_leave_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_users_id_fk" FOREIGN KEY ("approverId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_categoryId_benefit_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."benefit_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_claims" ADD CONSTRAINT "benefit_claims_approverId_users_id_fk" FOREIGN KEY ("approverId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_leave_types_id_fk" FOREIGN KEY ("leaveTypeId") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_leave_types_id_fk" FOREIGN KEY ("leaveTypeId") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_teamLeadId_users_id_fk" FOREIGN KEY ("teamLeadId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_projectManagerId_users_id_fk" FOREIGN KEY ("projectManagerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;