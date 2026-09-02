CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'fintoc');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"source" "transaction_source" DEFAULT 'fintoc' NOT NULL,
	"merchant" varchar(120),
	"description" varchar(240),
	"external_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_amount_nonzero_check" CHECK ("transaction"."amount" != 0),
	CONSTRAINT "transaction_type_amount_check" CHECK (("transaction"."type" = 'debit' AND "transaction"."amount" < 0) OR ("transaction"."type" = 'credit' AND "transaction"."amount" > 0))
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_account_external_uniq" ON "transaction" USING btree ("account_id","external_id") WHERE "transaction"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_account_booked_idx" ON "transaction" USING btree ("account_id","booked_at");