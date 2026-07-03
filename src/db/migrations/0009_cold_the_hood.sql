ALTER TABLE "receipt_verifications" DROP CONSTRAINT "receipt_verifications_claimId_benefit_claims_id_fk";
--> statement-breakpoint
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_claimId_benefit_claims_id_fk" FOREIGN KEY ("claimId") REFERENCES "public"."benefit_claims"("id") ON DELETE cascade ON UPDATE no action;