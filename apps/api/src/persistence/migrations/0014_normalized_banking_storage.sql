CREATE TYPE "public"."provider_sync_failure" AS ENUM('retryable', 'expired', 'revoked', 'invalid_data');--> statement-breakpoint
CREATE TYPE "public"."history_completeness" AS ENUM('complete', 'partial', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."booked_precision" AS ENUM('instant', 'calendar_day');--> statement-breakpoint
CREATE TYPE "public"."movement_relation" AS ENUM('transfer_pair', 'card_payment_pair', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."movement_removal_reason" AS ENUM('removed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."provider_internal_assessment" AS ENUM('internal', 'external', 'unknown');--> statement-breakpoint
CREATE TABLE "provider_sync_state" (
	"provider_connection_id" uuid PRIMARY KEY NOT NULL,
	"checkpoint" varchar(512),
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_reason" "provider_sync_failure",
	"retry_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_movement_removal" (
	"provider_connection_id" uuid NOT NULL,
	"account_external_id" varchar(512) NOT NULL,
	"movement_external_id" varchar(512) NOT NULL,
	"reason" "movement_removal_reason" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"provider_updated_at" timestamp with time zone,
	CONSTRAINT "provider_movement_removal_provider_connection_id_account_external_id_movement_external_id_pk" PRIMARY KEY("provider_connection_id","account_external_id","movement_external_id")
);
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_user_type_number_uniq";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "holder_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "balance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "balance" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "external_id" SET DATA TYPE varchar(512);--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "is_internal_movement" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "is_internal_movement" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "external_id" varchar(512);--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "history_completeness" "history_completeness" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "history_from" date;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "history_through" date;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "booked_precision" "booked_precision" DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "booked_on" date;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "provider_kind" varchar(32);--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "relation_kind" "movement_relation";--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "related_account_external_id" varchar(512);--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "related_movement_external_id" varchar(512);--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "counterparty_holder" jsonb;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "provider_internal_assessment" "provider_internal_assessment" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "user_internal_override" boolean;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "removal_reason" "movement_removal_reason";--> statement-breakpoint
ALTER TABLE "provider_sync_state" ADD CONSTRAINT "provider_sync_state_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_movement_removal" ADD CONSTRAINT "provider_movement_removal_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_connection_external_uniq" ON "account" USING btree ("provider_connection_id","external_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_history_window_check" CHECK (("account"."history_from" IS NULL OR "account"."history_through" IS NULL OR "account"."history_from" <= "account"."history_through")
      AND ("account"."history_completeness" != 'complete' OR ("account"."history_from" IS NOT NULL AND "account"."history_through" IS NOT NULL))
      AND ("account"."history_completeness" != 'unknown' OR ("account"."history_from" IS NULL AND "account"."history_through" IS NULL)));--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_booked_precision_check" CHECK (("transaction"."booked_precision" = 'instant' AND "transaction"."booked_on" IS NULL)
      OR ("transaction"."booked_precision" = 'calendar_day' AND "transaction"."booked_on" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_relation_check" CHECK (("transaction"."relation_kind" IS NULL AND "transaction"."related_account_external_id" IS NULL AND "transaction"."related_movement_external_id" IS NULL)
      OR ("transaction"."relation_kind" IS NOT NULL AND "transaction"."related_account_external_id" IS NOT NULL AND "transaction"."related_movement_external_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_removal_check" CHECK (("transaction"."removed_at" IS NULL AND "transaction"."removal_reason" IS NULL)
      OR ("transaction"."removed_at" IS NOT NULL AND "transaction"."removal_reason" IS NOT NULL));