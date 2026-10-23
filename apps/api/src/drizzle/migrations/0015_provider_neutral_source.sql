ALTER TABLE "provider" ALTER COLUMN "identifier" TYPE varchar(64) USING "identifier"::text;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "source" TYPE varchar(16) USING "source"::text;--> statement-breakpoint
UPDATE "transaction" SET "source" = 'provider' WHERE "source" = 'fintoc';--> statement-breakpoint
ALTER TABLE "transaction" ALTER COLUMN "source" SET DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_source_check" CHECK ("transaction"."source" IN ('manual', 'provider'));--> statement-breakpoint
DROP TYPE "public"."provider_identifier";--> statement-breakpoint
DROP TYPE "public"."transaction_source";
