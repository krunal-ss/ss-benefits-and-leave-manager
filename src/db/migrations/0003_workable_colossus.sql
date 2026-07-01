CREATE TYPE "public"."routing_mode" AS ENUM('sequential', 'parallel');--> statement-breakpoint
CREATE TABLE "approval_policy" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"routingMode" "routing_mode" DEFAULT 'sequential' NOT NULL,
	"wfhAutoApproveMaxDays" numeric(5, 1) DEFAULT '0' NOT NULL,
	"ccEmails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "approval_policy" ADD CONSTRAINT "approval_policy_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;