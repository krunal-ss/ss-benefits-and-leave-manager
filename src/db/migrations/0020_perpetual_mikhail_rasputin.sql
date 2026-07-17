CREATE TYPE "public"."employee_document_category" AS ENUM('identity', 'education', 'employment', 'financial', 'medical', 'other');--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"category" "employee_document_category" DEFAULT 'other' NOT NULL,
	"fileName" text NOT NULL,
	"storagePath" text NOT NULL,
	"contentType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"expiryDate" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;