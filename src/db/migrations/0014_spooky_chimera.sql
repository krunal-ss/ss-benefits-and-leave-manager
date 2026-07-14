CREATE TABLE "leave_policy_document" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"documentPath" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "eligibility" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "approver" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "noticeText" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "encashText" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "carryHeadline" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "carryText" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "processSteps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "faqs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_policy_document" ADD CONSTRAINT "leave_policy_document_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;