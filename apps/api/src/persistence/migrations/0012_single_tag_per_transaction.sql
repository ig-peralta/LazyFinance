ALTER TABLE "transaction_tag" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "transaction_tag" CASCADE;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "tag_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_tag_id_idx" ON "transaction" USING btree ("tag_id");