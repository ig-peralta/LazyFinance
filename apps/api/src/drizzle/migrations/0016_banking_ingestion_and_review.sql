CREATE TYPE "public"."provider_sync_result" AS ENUM('complete', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."provider_movement_conflict_reason" AS ENUM('receipt_incompatible', 'internal_override_disagrees', 'removed_confirmed_income');--> statement-breakpoint
CREATE TYPE "public"."movement_review_status" AS ENUM('clear', 'needs_review');--> statement-breakpoint
CREATE TABLE "provider_movement_conflict" (
	"transaction_id" uuid NOT NULL,
	"reason" "provider_movement_conflict_reason" NOT NULL,
	"previous_facts" jsonb NOT NULL,
	"incoming_facts" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "provider_movement_conflict_transaction_id_reason_pk" PRIMARY KEY("transaction_id","reason")
);
--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD COLUMN "last_provider_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD COLUMN "last_result" "provider_sync_result";--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD COLUMN "unresolved_conflict_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "provider_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "provider_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "review_status" "movement_review_status" DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_movement_conflict" ADD CONSTRAINT "provider_movement_conflict_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_revision_check" CHECK ("provider_sync_state"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_conflict_count_check" CHECK ("provider_sync_state"."unresolved_conflict_count" >= 0);