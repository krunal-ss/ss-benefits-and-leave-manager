CREATE TABLE "benefit_claim_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claimId" uuid NOT NULL,
	"versionNumber" integer NOT NULL,
	"amountPaise" integer,
	"categoryId" uuid,
	"expenseDate" date,
	"vendor" text,
	"documentUrl" text,
	"documentHash" text,
	"status" "claim_status" NOT NULL,
	"decisionReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benefit_claim_versions" ADD CONSTRAINT "benefit_claim_versions_claimId_benefit_claims_id_fk" FOREIGN KEY ("claimId") REFERENCES "public"."benefit_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefit_claim_versions" ADD CONSTRAINT "benefit_claim_versions_categoryId_benefit_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."benefit_categories"("id") ON DELETE no action ON UPDATE no action;