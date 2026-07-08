CREATE TYPE "public"."reminder_frequency" AS ENUM('once', 'weekly', 'daily');--> statement-breakpoint
CREATE TABLE "benefit_reminder_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"leadDaysBeforeFyEnd" jsonb DEFAULT '[90,60,30,7]'::jsonb NOT NULL,
	"frequency" "reminder_frequency" DEFAULT 'weekly' NOT NULL,
	"dashboardEnabled" boolean DEFAULT true NOT NULL,
	"emailEnabled" boolean DEFAULT true NOT NULL,
	"thresholdPaise" integer DEFAULT 500000 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" uuid
);
--> statement-breakpoint
ALTER TABLE "benefit_reminder_settings" ADD CONSTRAINT "benefit_reminder_settings_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;