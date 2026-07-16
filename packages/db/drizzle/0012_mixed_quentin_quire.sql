-- ADR-83: parent `builds` table — one row per idea lifecycle, `stage`
-- denormalized from planning_sessions/runs by the AFTER-triggers below.
-- Hand-edited from the generated DDL: build_id lands nullable first, is
-- backfilled from existing rows, then tightened to NOT NULL — the end state
-- matches the drizzle snapshot exactly.
CREATE TABLE "builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"idea" text NOT NULL,
	"stage" text DEFAULT 'clarifying' NOT NULL,
	"latest_run_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "builds_id_org_uq" UNIQUE("id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builds_org_created_idx" ON "builds" USING btree ("organization_id","created_at");--> statement-breakpoint

-- Backfill: one build per existing planning session, inheriting the
-- session's identity columns so history sorts identically.
ALTER TABLE "planning_sessions" ADD COLUMN "build_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "build_id" uuid;--> statement-breakpoint
-- Backfilled builds reuse their session's uuid as the build id — exact 1:1
-- pairing with no re-matching; new builds get their own gen_random_uuid().
INSERT INTO "builds" ("id", "organization_id", "user_id", "idea", "stage", "created_at", "updated_at")
SELECT ps."id", ps."organization_id", ps."user_id", ps."idea",
  CASE ps."status"
    WHEN 'abandoned' THEN 'abandoned'
    WHEN 'confirmed' THEN 'confirmed'
    ELSE CASE ps."phase" WHEN 'requirements' THEN 'clarifying' ELSE 'planning' END
  END,
  ps."created_at", ps."updated_at"
FROM "planning_sessions" ps;--> statement-breakpoint
UPDATE "planning_sessions" SET "build_id" = "id";--> statement-breakpoint
UPDATE "runs" r SET "build_id" = ps."build_id"
FROM "build_specs" bs
JOIN "planning_sessions" ps ON ps."id" = bs."session_id"
WHERE r."build_spec_id" = bs."id";--> statement-breakpoint
-- Builds with runs: stage and latest_run_id follow the newest run.
WITH latest AS (
  SELECT DISTINCT ON (r."build_id") r."build_id", r."id", r."status"
  FROM "runs" r
  ORDER BY r."build_id", r."created_at" DESC, r."id" DESC
)
UPDATE "builds" b SET "stage" = latest."status"::text, "latest_run_id" = latest."id"
FROM latest WHERE latest."build_id" = b."id";--> statement-breakpoint

ALTER TABLE "planning_sessions" ALTER COLUMN "build_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "build_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_build_org_fk" FOREIGN KEY ("build_id","organization_id") REFERENCES "public"."builds"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_build_org_fk" FOREIGN KEY ("build_id","organization_id") REFERENCES "public"."builds"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planning_sessions_build_uidx" ON "planning_sessions" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "runs_build_idx" ON "runs" USING btree ("build_id");--> statement-breakpoint

-- Stage sync (ADR-83). Triggers, not app code: four separate processes
-- write session/run status (API, orchestrator worker, evals harness, dev
-- CLI) — an application helper would drift the moment one site forgets.
-- Drizzle doesn't model triggers (migration-0002 precedent).
--
-- Session side: only drives stage while no run has claimed the build
-- (latest_run_id IS NULL). App flows already order it that way (confirm is
-- the session's terminal transition and gates run creation), but the guard
-- makes the invariant real at the DB — a session write after a run exists
-- (e.g. a future abandon-after-run flow) can never regress a live run
-- stage backward. Once a run exists, the run IS the stage (ADR-33 treats
-- partial/abandoned builds by their run outcome anyway).
CREATE FUNCTION sync_build_stage_from_session() RETURNS trigger AS $$
BEGIN
  UPDATE builds SET
    stage = CASE NEW.status
      WHEN 'abandoned' THEN 'abandoned'
      WHEN 'confirmed' THEN 'confirmed'
      ELSE CASE NEW.phase WHEN 'requirements' THEN 'clarifying' ELSE 'planning' END
    END,
    updated_at = now()
  WHERE id = NEW.build_id
    AND latest_run_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER planning_sessions_sync_build_stage
  AFTER INSERT OR UPDATE OF status, phase ON planning_sessions
  FOR EACH ROW EXECUTE FUNCTION sync_build_stage_from_session();
--> statement-breakpoint
-- Run side: an INSERT claims latest_run_id; UPDATEs only propagate from the
-- run that currently IS latest, so a stale earlier run can never clobber
-- the stage of a re-run.
CREATE FUNCTION sync_build_stage_from_run() RETURNS trigger AS $$
BEGIN
  UPDATE builds SET
    stage = NEW.status::text,
    latest_run_id = CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE latest_run_id END,
    updated_at = now()
  WHERE id = NEW.build_id
    AND (TG_OP = 'INSERT' OR latest_run_id = NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER runs_sync_build_stage
  AFTER INSERT OR UPDATE OF status ON runs
  FOR EACH ROW EXECUTE FUNCTION sync_build_stage_from_run();
