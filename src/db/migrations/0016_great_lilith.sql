ALTER TABLE "favorite_vendors" ADD COLUMN "vendorKey" text;--> statement-breakpoint
UPDATE "favorite_vendors" SET "vendorKey" = lower(trim("vendorName")) WHERE "vendorKey" IS NULL;--> statement-breakpoint
ALTER TABLE "favorite_vendors" ALTER COLUMN "vendorKey" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_vendors_user_vendor_key_idx" ON "favorite_vendors" USING btree ("userId","vendorKey");