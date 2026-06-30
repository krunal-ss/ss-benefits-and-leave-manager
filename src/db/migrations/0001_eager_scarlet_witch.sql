ALTER TABLE "leave_requests" ADD COLUMN "teamLeadId" uuid;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "projectManagerId" uuid;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_teamLeadId_users_id_fk" FOREIGN KEY ("teamLeadId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_projectManagerId_users_id_fk" FOREIGN KEY ("projectManagerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;