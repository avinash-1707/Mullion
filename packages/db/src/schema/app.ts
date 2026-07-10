import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
    idea: text("idea").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ADR-29: at most one active planning session per user, enforced at the
    // DB layer so it can't drift from application code. Per user, not per
    // org (ADR-36).
    uniqueIndex("planning_sessions_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index("planning_sessions_org_idx").on(t.organizationId),
  ],
);

export const buildSpecs = pgTable(
  "build_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => planningSessions.id),
    contentHash: text("content_hash").notNull(),
    // The frozen §2.5 artifact — immutable once written.
    spec: jsonb("spec").notNull(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("build_specs_org_idx").on(t.organizationId)],
);

// Append-only design memory (ADR-08); schema per 02 §4.1.
export const decisionLog = pgTable(
  "decision_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalized for cheap org scoping (ADR-36).
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    buildSpecId: uuid("build_spec_id").references(() => buildSpecs.id),
    sessionId: uuid("session_id").references(() => planningSessions.id),
    phase: text("phase", { enum: ["requirements", "architecture", "build"] }),
    actor: text("actor"),
    decision: text("decision"),
    rationale: text("rationale"),
    alternativesConsidered: text("alternatives_considered"),
    supersedes: uuid("supersedes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("decision_log_session_idx").on(t.sessionId),
    index("decision_log_org_idx").on(t.organizationId),
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
    buildSpecId: uuid("build_spec_id")
      .notNull()
      .references(() => buildSpecs.id),
    status: runStatus("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ADR-29: one active build per user.
    uniqueIndex("runs_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} NOT IN ('done', 'failed')`),
    index("runs_org_idx").on(t.organizationId),
  ],
);

/** Placeholder until Phase 2. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    description: text("description").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_run_idx").on(t.runId), index("tasks_org_idx").on(t.organizationId)],
);

/** Placeholder until Phase 2 — structured agent-message envelopes. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    envelope: jsonb("envelope").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_run_idx").on(t.runId), index("messages_org_idx").on(t.organizationId)],
);

/**
 * ADR-25: role → model routing lives in a config table, swappable without a
 * redeploy. Slug *values* are seeded from packages/llm (the only place a
 * model string is written down — CODING_STANDARDS §3).
 */
export const modelRouting = pgTable("model_routing", {
  role: text("role", {
    enum: ["analyst", "planner", "coder", "tester", "reviewer", "devops"],
  }).primaryKey(),
  modelSlug: text("model_slug").notNull(),
  // ADR-27 is global policy; a false here must never be written in v1.
  zdrOnly: boolean("zdr_only").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cost_events_org_idx").on(t.organizationId)],
);

/**
 * SSE backfill log (ADR-18/19): every streamed event lands here first;
 * `id` is monotonic per stream and doubles as the SSE `id:` field, so a
 * reconnect with Last-Event-ID replays exactly what was missed.
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
