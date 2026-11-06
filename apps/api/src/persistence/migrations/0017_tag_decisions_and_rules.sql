CREATE TYPE "public"."tag_rule_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."tag_rule_field" AS ENUM('merchant', 'description');--> statement-breakpoint
CREATE TYPE "public"."tag_rule_mode" AS ENUM('suggest', 'auto');--> statement-breakpoint
CREATE TYPE "public"."tag_decision_event_kind" AS ENUM('manual_tag', 'manual_no_tag', 'reset', 'rule_applied', 'rule_revalidated');--> statement-breakpoint
CREATE TYPE "public"."tag_decision_origin" AS ENUM('unreviewed', 'manual', 'rule');--> statement-breakpoint
CREATE TABLE "tag_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"account_id" uuid,
	"direction" "tag_rule_direction" NOT NULL,
	"match_field" "tag_rule_field" NOT NULL,
	"match_value" varchar(240) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"mode" "tag_rule_mode" DEFAULT 'suggest' NOT NULL,
	"approved_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_rule_auto_approval_check" CHECK (("tag_rule"."mode" = 'auto' AND "tag_rule"."approved_at" IS NOT NULL)
    OR ("tag_rule"."mode" = 'suggest' AND "tag_rule"."approved_at" IS NULL)),
	CONSTRAINT "tag_rule_match_nonempty_check" CHECK (length(trim("tag_rule"."match_value")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tag_decision_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"previous_tag_id" uuid,
	"tag_id" uuid,
	"rule_id" uuid,
	"kind" "tag_decision_event_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tag_decision_origin" "tag_decision_origin" DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tag_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tag_decided_at" timestamp with time zone;--> statement-breakpoint
-- Existing tagged movements predate provenance tracking. Treat them as user-owned
-- so later automation cannot silently replace an established classification.
UPDATE "transaction" SET "tag_decision_origin" = 'manual', "tag_decided_at" = "created_at" WHERE "tag_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tag_rule" ADD CONSTRAINT "tag_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_rule" ADD CONSTRAINT "tag_rule_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_rule" ADD CONSTRAINT "tag_rule_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_decision_event" ADD CONSTRAINT "tag_decision_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_decision_event" ADD CONSTRAINT "tag_decision_event_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_decision_event" ADD CONSTRAINT "tag_decision_event_previous_tag_id_tag_id_fk" FOREIGN KEY ("previous_tag_id") REFERENCES "public"."tag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_decision_event" ADD CONSTRAINT "tag_decision_event_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_decision_event" ADD CONSTRAINT "tag_decision_event_rule_id_tag_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."tag_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tag_rule_user_active_idx" ON "tag_rule" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "tag_decision_event_transaction_id_idx" ON "tag_decision_event" USING btree ("transaction_id","created_at");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_tag_rule_id_tag_rule_id_fk" FOREIGN KEY ("tag_rule_id") REFERENCES "public"."tag_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_tag_decision_check" CHECK (("transaction"."tag_decision_origin" = 'unreviewed' AND "transaction"."tag_id" IS NULL AND "transaction"."tag_rule_id" IS NULL)
      OR ("transaction"."tag_decision_origin" = 'manual' AND "transaction"."tag_rule_id" IS NULL)
      OR ("transaction"."tag_decision_origin" = 'rule' AND "transaction"."tag_id" IS NOT NULL AND "transaction"."tag_rule_id" IS NOT NULL));
