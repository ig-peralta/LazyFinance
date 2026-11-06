CREATE TABLE "external_identity" (
	"provider" varchar(40) NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"provider_subject" varchar(256) NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_provider_issuer_subject_pk" PRIMARY KEY("provider","issuer","provider_subject")
);
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "api_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_user_provider_issuer_unique" ON "external_identity" USING btree ("user_id","provider","issuer");