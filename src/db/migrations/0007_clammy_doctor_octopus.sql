CREATE TYPE "public"."receipt_verdict" AS ENUM('approve', 'review', 'reject');--> statement-breakpoint
CREATE TABLE "receipt_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claimId" uuid NOT NULL,
	"aiScore" integer NOT NULL,
	"verdict" "receipt_verdict" NOT NULL,
	"verdictReason" text NOT NULL,
	"factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fraudSignals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicateMatch" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_verifications_claimId_unique" UNIQUE("claimId")
);
--> statement-breakpoint
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_claimId_benefit_claims_id_fk" FOREIGN KEY ("claimId") REFERENCES "public"."benefit_claims"("id") ON DELETE no action ON UPDATE no action;