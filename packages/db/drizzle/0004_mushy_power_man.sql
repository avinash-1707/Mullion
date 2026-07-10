ALTER TABLE "messages" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "spec_task_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "verify_command" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_org_uq" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_org_fk" FOREIGN KEY ("task_id","organization_id") REFERENCES "public"."tasks"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_task_seq_idx" ON "messages" USING btree ("task_id","seq");