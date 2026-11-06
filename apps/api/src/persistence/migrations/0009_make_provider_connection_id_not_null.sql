ALTER TABLE "account" DROP CONSTRAINT "account_provider_connection_id_provider_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "provider_connection_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_connection_id_provider_connection_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE restrict ON UPDATE no action;