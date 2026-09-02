CREATE TYPE "public"."objective_intent" AS ENUM('spending', 'saving');--> statement-breakpoint
CREATE TYPE "public"."objective_kind" AS ENUM('time_based', 'amount_based');--> statement-breakpoint
CREATE TYPE "public"."objective_period" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"kind" "objective_kind" NOT NULL,
	"intent" "objective_intent" NOT NULL,
	"is_recurring" boolean,
	"period" "objective_period",
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_amount_positive_check" CHECK ("objective"."amount" > 0),
	CONSTRAINT "objective_kind_period_check" CHECK ((
        ("objective"."kind" = 'amount_based' AND "objective"."is_recurring" IS NULL AND "objective"."period" IS NULL AND "objective"."start_date" IS NULL AND "objective"."end_date" IS NULL) OR
        ("objective"."kind" = 'time_based' AND "objective"."is_recurring" = true AND "objective"."period" IS NOT NULL AND "objective"."start_date" IS NOT NULL) OR
        ("objective"."kind" = 'time_based' AND "objective"."is_recurring" = false AND "objective"."period" IS NULL AND "objective"."start_date" IS NOT NULL AND "objective"."end_date" IS NOT NULL)
      )),
	CONSTRAINT "objective_dates_order_check" CHECK ("objective"."end_date" IS NULL OR "objective"."start_date" IS NULL OR "objective"."end_date" > "objective"."start_date")
);
--> statement-breakpoint
ALTER TABLE "objective" ADD CONSTRAINT "objective_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "objective_user_id_idx" ON "objective" USING btree ("user_id");