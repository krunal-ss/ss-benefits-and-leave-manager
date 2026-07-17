CREATE TYPE "public"."delegation_scope" AS ENUM('leave', 'expense', 'both');--> statement-breakpoint
CREATE TYPE "public"."delegation_status" AS ENUM('active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "approval_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"managerId" uuid NOT NULL,
	"delegateId" uuid NOT NULL,
	"scope" "delegation_scope" DEFAULT 'both' NOT NULL,
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"status" "delegation_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_managerId_users_id_fk" FOREIGN KEY ("managerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegateId_users_id_fk" FOREIGN KEY ("delegateId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;