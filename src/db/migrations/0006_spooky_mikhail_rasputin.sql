CREATE TABLE "team_capacity_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"scopeType" text NOT NULL,
	"scopeId" text,
	"totalHeadcount" integer NOT NULL,
	"availableCount" numeric(6, 1) NOT NULL,
	"capacityPercent" integer NOT NULL,
	"computedAt" timestamp with time zone DEFAULT now() NOT NULL
);
