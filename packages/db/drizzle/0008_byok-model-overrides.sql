CREATE TABLE "byok_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"encrypted_key" text NOT NULL,
	"key_last4" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_overrides" (
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"model_slug" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "byok" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "byok_keys" ADD CONSTRAINT "byok_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byok_keys" ADD CONSTRAINT "byok_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_overrides" ADD CONSTRAINT "model_overrides_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "byok_keys_org_uidx" ON "byok_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_overrides_org_role_uidx" ON "model_overrides" USING btree ("organization_id","role");--> statement-breakpoint
CREATE INDEX "model_overrides_org_idx" ON "model_overrides" USING btree ("organization_id");