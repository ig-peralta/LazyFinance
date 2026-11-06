CREATE TYPE "public"."income_amount_kind" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."income_regularity" AS ENUM('regular', 'irregular');--> statement-breakpoint
CREATE TABLE "income_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"currency" "currency" DEFAULT 'CLP' NOT NULL,
	"regularity" "income_regularity" NOT NULL,
	"amount_kind" "income_amount_kind" NOT NULL,
	"expected_amount" numeric(15, 2),
	"schedule" jsonb,
	"start_date" date NOT NULL,
	"end_date" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_source_amount_check" CHECK ("income_source"."expected_amount" IS NULL OR "income_source"."expected_amount" > 0),
	CONSTRAINT "income_source_fixed_amount_check" CHECK ("income_source"."amount_kind" != 'fixed' OR "income_source"."expected_amount" IS NOT NULL),
	CONSTRAINT "income_source_schedule_check" CHECK (("income_source"."regularity" = 'regular' AND "income_source"."schedule" IS NOT NULL) OR ("income_source"."regularity" = 'irregular' AND "income_source"."schedule" IS NULL)),
	CONSTRAINT "income_source_dates_check" CHECK ("income_source"."end_date" IS NULL OR "income_source"."end_date" >= "income_source"."start_date")
);
--> statement-breakpoint
CREATE TABLE "income_expectation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	CONSTRAINT "income_expectation_amount_check" CHECK ("income_expectation"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "income_receipt" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income_source" ADD CONSTRAINT "income_source_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_expectation" ADD CONSTRAINT "income_expectation_source_id_income_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."income_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_receipt" ADD CONSTRAINT "income_receipt_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_receipt" ADD CONSTRAINT "income_receipt_source_id_income_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."income_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_source_user_id_idx" ON "income_source" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "income_expectation_source_date_idx" ON "income_expectation" USING btree ("source_id","date");--> statement-breakpoint
CREATE INDEX "income_receipt_source_id_idx" ON "income_receipt" USING btree ("source_id");