ALTER TABLE "benefit_claims" ALTER COLUMN "categoryId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "benefit_claims" ALTER COLUMN "amountPaise" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "benefit_claims" ALTER COLUMN "expenseDate" DROP NOT NULL;