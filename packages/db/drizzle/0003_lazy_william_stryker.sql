CREATE TABLE "graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"target_key" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"acceptance_criteria" text,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcq_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"questions" jsonb NOT NULL,
	"answers" jsonb,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcq_rounds_round_cap" CHECK ("mcq_rounds"."round" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "requirements_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "phase" text DEFAULT 'requirements' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "agent_state" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "agent_task" jsonb;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "agent_error" text;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "graph_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_sessions" ADD COLUMN "consistency" jsonb;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_decision_id_decision_log_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_rounds" ADD CONSTRAINT "mcq_rounds_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcq_rounds" ADD CONSTRAINT "mcq_rounds_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements_docs" ADD CONSTRAINT "requirements_docs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements_docs" ADD CONSTRAINT "requirements_docs_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."planning_sessions"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "graph_edges_session_pair_uidx" ON "graph_edges" USING btree ("session_id","source_key","target_key");--> statement-breakpoint
CREATE INDEX "graph_edges_org_idx" ON "graph_edges" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_nodes_session_key_uidx" ON "graph_nodes" USING btree ("session_id","node_key");--> statement-breakpoint
CREATE INDEX "graph_nodes_org_idx" ON "graph_nodes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcq_rounds_session_round_uidx" ON "mcq_rounds" USING btree ("session_id","round");--> statement-breakpoint
CREATE INDEX "mcq_rounds_org_idx" ON "mcq_rounds" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_docs_session_version_uidx" ON "requirements_docs" USING btree ("session_id","version");--> statement-breakpoint
CREATE INDEX "requirements_docs_org_idx" ON "requirements_docs" USING btree ("organization_id");