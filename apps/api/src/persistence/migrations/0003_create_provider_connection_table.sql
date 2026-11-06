CREATE TYPE "public"."connection_mode" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "provider_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"mode" "connection_mode",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_provider_id_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_connection_user_id_idx" ON "provider_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "provider_connection_provider_id_idx" ON "provider_connection" USING btree ("provider_id");