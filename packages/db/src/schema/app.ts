import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";

export const planningSessionStatus = pgEnum("planning_session_status", [
  "active",
  "confirmed",
  "abandoned",
]);

/**
 * Planning sessions (product Phases 0–3). Named `planning_sessions` at the
 * table level because Better Auth already owns `session` for auth sessions.
 */
export const planningSessions = pgTable(
  "planning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    status: planningSessionStatus("status").notNull().default("active"),
    // Product phase within an active session (01 §1): requirements (Analyst
    // MCQ) → architecture (Planner). Confirmed/frozen is `status`, not a
    // third phase value.
    phase: text("phase", { enum: ["requirements", "architecture"] })
      .notNull()
      .default("requirements"),
    // Background agent-loop state (02 §2.4): 'working' rows refuse a second
    // concurrent agent run (claim is a conditional UPDATE, safe across
    // instances); 'error' rows hold agent_task so "try again" re-runs it.
    agentState: text("agent_state", { enum: ["idle", "working", "error"] })
      .notNull()
      .default("idle"),
    agentTask: jsonb("agent_task"),
    agentError: text("agent_error"),
    // Bumped on every graph mutation; a consistency verdict is only valid
    // for the version it checked (01 §4.3 — a stale pass never unlocks
    // confirmation).
    graphVersion: integer("graph_version").notNull().default(0),
    // Latest ConsistencyResult (schemas/planning.ts), incl. graphVersion.
    consistency: jsonb("consistency"),
    idea: text("idea").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // ADR-29: at most one active planning session per user, enforced at the
    // DB layer so it can't drift from application code. Per user, not per
    // org (ADR-36).
    uniqueIndex("planning_sessions_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index("planning_sessions_org_idx").on(t.organizationId),
    // Composite-FK target: lets children pin (parent id, org) together so a
    // denormalized organization_id can never disagree with its parent's.
    unique("planning_sessions_id_org_uq").on(t.id, t.organizationId),
  ],
);

export const buildSpecs = pgTable(
  "build_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id").notNull(),
    contentHash: text("content_hash").notNull(),
    // The frozen §2.5 artifact — immutable once written (also enforced by a
    // BEFORE UPDATE/DELETE trigger in the hand-written migration).
    spec: jsonb("spec").notNull(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("build_specs_org_idx").on(t.organizationId),
    // Fork A/B fetch the spec by session, and confirmation freezes at most
    // one spec per session (02 §2.1) — unique doubles as the lookup index.
    uniqueIndex("build_specs_session_uidx").on(t.sessionId),
    unique("build_specs_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "build_specs_session_org_fk",
    }),
  ],
);

/**
 * Analyst MCQ rounds (01 §3 / 02 §2.2). Hard cap of 2 enforced here and in
 * the service. Questions/answers are jsonb validated by zod at the boundary
 * — their shape belongs to packages/schemas, not the DB.
 */
export const mcqRounds = pgTable(
  "mcq_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id").notNull(),
    round: integer("round").notNull(),
    questions: jsonb("questions").notNull(),
    answers: jsonb("answers"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mcq_rounds_session_round_uidx").on(t.sessionId, t.round),
    index("mcq_rounds_org_idx").on(t.organizationId),
    check("mcq_rounds_round_cap", sql`${t.round} IN (1, 2)`),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "mcq_rounds_session_org_fk",
    }),
  ],
);

/**
 * Requirements Document versions (01 §3). Versioned, not overwritten —
 * editing answers regenerates a new version, and the Build Spec freeze
 * records exactly which one it consumed.
 */
export const requirementsDocs = pgTable(
  "requirements_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id").notNull(),
    version: integer("version").notNull(),
    doc: jsonb("doc").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("requirements_docs_session_version_uidx").on(t.sessionId, t.version),
    index("requirements_docs_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "requirements_docs_session_org_fk",
    }),
  ],
);

/**
 * Architecture graph nodes (02 §2.3). One row per (session, node_key);
 * re-derivation updates content in place and bumps `revision` — the UI
 * renders revision > 1 as "revised", status 'removed' as ghosted, never
 * deleted (02 §12). Task nodes double as the Build Spec task graph.
 */
export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id").notNull(),
    nodeKey: text("node_key").notNull(),
    kind: text("kind", { enum: ["service", "datastore", "external", "task"] }).notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    revision: integer("revision").notNull().default(1),
    acceptanceCriteria: text("acceptance_criteria"),
    // Task-graph dependency keys (node_key values), for task nodes.
    dependsOn: jsonb("depends_on").notNull().default([]),
    // Every node traces to the decision that produced its current content
    // (01 §9 — no node appears without a logged rationale).
    decisionId: uuid("decision_id").references(() => decisionLog.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("graph_nodes_session_key_uidx").on(t.sessionId, t.nodeKey),
    index("graph_nodes_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "graph_nodes_session_org_fk",
    }),
  ],
);

/** Data/call-flow edges between graph nodes, keyed by node_key (02 §2.3). */
export const graphEdges = pgTable(
  "graph_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id").notNull(),
    sourceKey: text("source_key").notNull(),
    targetKey: text("target_key").notNull(),
    label: text("label"),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("graph_edges_session_pair_uidx").on(t.sessionId, t.sourceKey, t.targetKey),
    index("graph_edges_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "graph_edges_session_org_fk",
    }),
  ],
);

// Append-only design memory (ADR-08); schema per 02 §4.1, tightened per
// ADR-39: a row with no decision, actor, phase, or parent is meaningless.
export const decisionLog = pgTable(
  "decision_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalized for cheap org scoping (ADR-36).
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    buildSpecId: uuid("build_spec_id"),
    sessionId: uuid("session_id"),
    phase: text("phase", { enum: ["requirements", "architecture", "build"] }).notNull(),
    actor: text("actor").notNull(),
    decision: text("decision").notNull(),
    rationale: text("rationale"),
    alternativesConsidered: text("alternatives_considered"),
    supersedes: uuid("supersedes").references((): AnyPgColumn => decisionLog.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decision_log_session_idx").on(t.sessionId),
    index("decision_log_org_idx").on(t.organizationId),
    check(
      "decision_log_has_parent",
      sql`${t.sessionId} IS NOT NULL OR ${t.buildSpecId} IS NOT NULL`,
    ),
    foreignKey({
      columns: [t.sessionId, t.organizationId],
      foreignColumns: [planningSessions.id, planningSessions.organizationId],
      name: "decision_log_session_org_fk",
    }),
    foreignKey({
      columns: [t.buildSpecId, t.organizationId],
      foreignColumns: [buildSpecs.id, buildSpecs.organizationId],
      name: "decision_log_build_spec_org_fk",
    }),
  ],
);

// ADR-13 state machine. Everything before the two terminal states counts as
// active for the one-active-build-per-user constraint.
export const runStatus = pgEnum("run_status", [
  "queued",
  "building",
  "testing",
  "reviewing",
  "fixing",
  "shipping",
  "done",
  "failed",
]);

/** Placeholder until Phase 2 — exists now so ADR-29's constraint is in from day one. */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    buildSpecId: uuid("build_spec_id").notNull(),
    status: runStatus("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // ADR-29: one active build per user.
    uniqueIndex("runs_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} NOT IN ('done', 'failed')`),
    index("runs_org_idx").on(t.organizationId),
    unique("runs_id_org_uq").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.buildSpecId, t.organizationId],
      foreignColumns: [buildSpecs.id, buildSpecs.organizationId],
      name: "runs_build_spec_org_fk",
    }),
  ],
);

/**
 * One Build-Spec task_graph node under execution (M1: exactly one per run).
 * `status` stays TEXT with a TS enum per the model_routing precedent —
 * the set grows in M2+ and text avoids ALTER TYPE churn; zod guards the
 * boundary.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    runId: uuid("run_id").notNull(),
    // The task_graph's task_id string — distinct from the uuid PK.
    specTaskId: text("spec_task_id"),
    description: text("description").notNull(),
    acceptanceCriteria: text("acceptance_criteria"),
    // spec_task_id strings, mirroring graph_nodes.depends_on.
    dependsOn: jsonb("depends_on").notNull().default([]),
    // Machine gate the runner executes on submit (ADR-46) — M2's Tester
    // derives this; M1 takes it from the harness.
    verifyCommand: text("verify_command"),
    status: text("status", {
      enum: ["pending", "running", "verified", "failed"],
    })
      .notNull()
      .default("pending"),
    // M3: workflow-level attempt counter (observability; the authoritative
    // retry count lives in Temporal history).
    attempt: integer("attempt").notNull().default(0),
    // TaskResult (turns, costUsd, durationMs, failure reason).
    result: jsonb("result"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_run_idx").on(t.runId),
    index("tasks_org_idx").on(t.organizationId),
    // Lets children (messages) pin to this task's org, like runs/build_specs.
    unique("tasks_id_org_uq").on(t.id, t.organizationId),
    // M3 (ADR-52): idempotent task creation — a Temporal activity retry must
    // not duplicate the row for a (run, spec task).
    uniqueIndex("tasks_run_spec_task_uidx")
      .on(t.runId, t.specTaskId)
      .where(sql`${t.specTaskId} IS NOT NULL`),
    foreignKey({
      columns: [t.runId, t.organizationId],
      foreignColumns: [runs.id, runs.organizationId],
      name: "tasks_run_org_fk",
    }),
  ],
);

/**
 * Agent-message transcript. `seq` (bigserial) gives replay order — each
 * task's loop is the sole writer of its own messages, so insert order is
 * uncontended; readers use WHERE task_id = ? ORDER BY seq.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    runId: uuid("run_id").notNull(),
    // Nullable: M2+ adds run-level (non-task) messages.
    taskId: uuid("task_id"),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    envelope: jsonb("envelope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_run_idx").on(t.runId),
    index("messages_org_idx").on(t.organizationId),
    index("messages_task_seq_idx").on(t.taskId, t.seq),
    foreignKey({
      columns: [t.runId, t.organizationId],
      foreignColumns: [runs.id, runs.organizationId],
      name: "messages_run_org_fk",
    }),
    foreignKey({
      columns: [t.taskId, t.organizationId],
      foreignColumns: [tasks.id, tasks.organizationId],
      name: "messages_task_org_fk",
    }),
  ],
);

/**
 * Delivery records (M4, ADR-54). One row per successful delivery of a run to
 * a target (archive | github). `is_partial` records ADR-33 partial/abandoned
 * builds delivered identically to full ones.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    runId: uuid("run_id").notNull(),
    kind: text("kind", { enum: ["archive", "github"] }).notNull(),
    ref: text("ref").notNull(),
    isPartial: boolean("is_partial").notNull().default(false),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_run_idx").on(t.runId),
    index("deliveries_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.runId, t.organizationId],
      foreignColumns: [runs.id, runs.organizationId],
      name: "deliveries_run_org_fk",
    }),
  ],
);

/**
 * ADR-25: role → model routing lives in a config table, swappable without a
 * redeploy. Slug *values* are seeded from packages/llm (the only place a
 * model string is written down — CODING_STANDARDS §3).
 *
 * `role`/`phase`/`source` stay TEXT with a TS enum rather than pgEnum —
 * deliberate: these sets grow (e.g. 'sandbox' cost source in Phase 2) and
 * text avoids ALTER TYPE churn; zod guards the boundary (ADR-39 note).
 */
export const modelRouting = pgTable("model_routing", {
  role: text("role", {
    enum: ["analyst", "planner", "coder", "tester", "reviewer", "devops"],
  }).primaryKey(),
  modelSlug: text("model_slug").notNull(),
  // ADR-27 is global policy; a false here must never be written in v1.
  zdrOnly: boolean("zdr_only").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * ADR-28 cost capture (stub budget tracker). `source` widens to 'sandbox'
 * in Phase 2 when E2B cost exists and the combined budget (ADR-31) lands.
 */
export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id").references(() => user.id),
    sessionId: uuid("session_id").references(() => planningSessions.id),
    runId: uuid("run_id").references(() => runs.id),
    source: text("source", { enum: ["llm", "sandbox"] }).notNull(),
    role: text("role"),
    modelSlug: text("model_slug"),
    // OpenRouter credits are fractional — numeric, never float.
    cost: numeric("cost", { precision: 12, scale: 8 }).notNull(),
    usage: jsonb("usage"),
    // ADR-70: true when the call was paid by the org's own OpenRouter key.
    // The org budget window filters on this; the per-run ceiling does not.
    byok: boolean("byok").notNull().default(false),
    // Denormalized from `usage` so the settings analytics query is plain
    // SUM()s, not jsonb extraction (ADR-70). Null on sandbox rows and on
    // LLM rows recorded before this column existed.
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Budget checks are SUM(cost) per org per period (ADR-28/31) — the
    // created_at suffix keeps them a range scan, not an org-wide scan.
    index("cost_events_org_created_idx").on(t.organizationId, t.createdAt),
    // Per-run budget circuit breaker (02 §9).
    index("cost_events_run_idx").on(t.runId),
  ],
);

/**
 * ADR-70: one BYOK OpenRouter key per org, encrypted at rest with the same
 * AES-256-GCM primitive Better Auth uses for OAuth tokens. Only key_last4
 * ever leaves the API. `enabled` flips false when a call fails auth on this
 * key mid-build — later calls then skip straight to the platform key.
 */
export const byokKeys = pgTable(
  "byok_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    // Who saved it — audit only, the key belongs to the org (ADR-70).
    userId: text("user_id").references(() => user.id),
    encryptedKey: text("encrypted_key").notNull(),
    keyLast4: text("key_last4").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("byok_keys_org_uidx").on(t.organizationId)],
);

/**
 * ADR-71: per-org, per-role model override. Absence of a row = the
 * model_routing default (ADR-25). Slugs are validated against the static
 * allowlist in packages/llm at write time AND re-checked at read time, so a
 * stale row falls back instead of failing a build.
 */
export const modelOverrides = pgTable(
  "model_overrides",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    role: text("role", {
      enum: ["analyst", "planner", "coder", "tester", "reviewer", "devops"],
    }).notNull(),
    modelSlug: text("model_slug").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("model_overrides_org_role_uidx").on(t.organizationId, t.role),
    index("model_overrides_org_idx").on(t.organizationId),
  ],
);

/**
 * SSE backfill log (ADR-18/19): every streamed event lands here first;
 * `id` is monotonic per stream and doubles as the SSE `id:` field, so a
 * reconnect with Last-Event-ID replays exactly what was missed. Per-stream
 * commit ordering is serialized by an advisory lock in publishStreamEvent
 * (ADR-38) — without it a slow commit could be skipped by the poll cursor.
 *
 * `stream_id` is intentionally POLYMORPHIC (a planning-session id OR a run
 * id), so no composite FK to a single parent is possible (ADR-52). Org
 * consistency is enforced at the write boundary (publishStreamEvent takes
 * organizationId) and the read boundary (streamEvents filters by org), not
 * a foreign key.
 */
export const streamEvents = pgTable(
  "stream_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    // e.g. a planning session id now, a run id in Phase 2.
    streamId: uuid("stream_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stream_events_stream_idx").on(t.streamId, t.id)],
);
