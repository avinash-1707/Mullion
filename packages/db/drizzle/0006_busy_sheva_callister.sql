CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"is_partial" boolean DEFAULT false NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_run_org_fk" FOREIGN KEY ("run_id","organization_id") REFERENCES "public"."runs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_run_idx" ON "deliveries" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "deliveries_org_idx" ON "deliveries" USING btree ("organization_id");