CREATE TYPE "public"."provider_identifier" AS ENUM('fintoc', 'manual');--> statement-breakpoint
CREATE TABLE "provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" "provider_identifier" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_identifier_unique" UNIQUE("identifier")
);
