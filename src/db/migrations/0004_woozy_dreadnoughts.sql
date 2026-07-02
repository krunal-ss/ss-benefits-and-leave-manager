CREATE TYPE "public"."staffing_threshold_scope" AS ENUM('org', 'department');--> statement-breakpoint
CREATE TABLE "staffing_threshold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "staffing_threshold_scope" NOT NULL,
	"scopeValue" text,
	"minAvailablePercent" integer NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "staffing_threshold" ADD CONSTRAINT "staffing_threshold_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;