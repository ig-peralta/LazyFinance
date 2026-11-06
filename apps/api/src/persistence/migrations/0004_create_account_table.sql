CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'credit_card');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('CLP');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_connection_id" uuid,
	"type" "account_type" NOT NULL,
	"number" varchar(64) NOT NULL,
	"holder_name" varchar(120) NOT NULL,
	"holder_rut" varchar(16),
	"alias" varchar(80),
	"currency" "currency" DEFAULT 'CLP' NOT NULL,
	"balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_user_type_number_uniq" UNIQUE("user_id","type","number")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_connection_id_idx" ON "account" USING btree ("provider_connection_id");