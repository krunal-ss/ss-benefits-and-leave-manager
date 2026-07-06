ALTER TYPE "public"."leave_request_status" ADD VALUE 'cancellation_requested';--> statement-breakpoint
ALTER TABLE "approval_policy" ADD COLUMN "requireLeaveCancellationApproval" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "cancellationReason" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "cancelledAt" timestamp with time zone;