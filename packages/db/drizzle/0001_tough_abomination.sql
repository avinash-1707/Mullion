ALTER TABLE "build_specs" DROP CONSTRAINT "build_specs_session_id_planning_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "decision_log" DROP CONSTRAINT "decision_log_build_spec_id_build_specs_id_fk";
--> statement-breakpoint
ALTER TABLE "decision_log" DROP CONSTRAINT "decision_log_session_id_planning_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_run_id_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_build_spec_id_build_specs_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_run_id_runs_id_fk";
--> statement-breakpoint
DROP INDEX "member_organization_id_idx";--> statement-breakpoint
DROP INDEX "cost_events_org_idx";--> statement-breakpoint
ALTER TABLE "decision_log" ALTER COLUMN "phase" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_log" ALTER COLUMN "actor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_log" ALTER COLUMN "decision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "build_specs" ADD CONSTRAINT "build_specs_id_org_uq" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_id_org_uq" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_id_org_uq" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "build_specs" ADD CONSTRAINT "build_specs_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_supersedes_decision_log_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."decision_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_build_spec_org_fk" FOREIGN KEY ("build_spec_id","organization_id") REFERENCES "public"."build_specs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_run_org_fk" FOREIGN KEY ("run_id","organization_id") REFERENCES "public"."runs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_build_spec_org_fk" FOREIGN KEY ("build_spec_id","organization_id") REFERENCES "public"."build_specs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_run_org_fk" FOREIGN KEY ("run_id","organization_id") REFERENCES "public"."runs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_org_email_pending_uidx" ON "invitation" USING btree ("organization_id","email") WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uidx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "build_specs_session_uidx" ON "build_specs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cost_events_org_created_idx" ON "cost_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "cost_events_run_idx" ON "cost_events" USING btree ("run_id");--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_has_parent" CHECK ("decision_log"."session_id" IS NOT NULL OR "decision_log"."build_spec_id" IS NOT NULL);