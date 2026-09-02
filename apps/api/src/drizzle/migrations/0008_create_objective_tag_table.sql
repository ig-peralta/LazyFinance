CREATE TABLE "objective_tag" (
	"objective_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "objective_tag_objective_id_tag_id_pk" PRIMARY KEY("objective_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "objective_tag" ADD CONSTRAINT "objective_tag_objective_id_objective_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objective"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_tag" ADD CONSTRAINT "objective_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;