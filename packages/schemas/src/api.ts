import { z } from "zod";

// One schema per route (CODING_STANDARDS §8) — imported by both the Hono
// handler and the Next.js client, never duplicated.

export const createPlanningSessionBodySchema = z.object({
  idea: z.string().min(1).max(10_000),
});

export const planningSessionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  userId: z.string(),
  status: z.enum(["active", "confirmed", "abandoned"]),
  phase: z.enum(["requirements", "architecture"]),
  agentState: z.enum(["idle", "working", "error"]),
  idea: z.string(),
  createdAt: z.string(),
});

export type PlanningSession = z.infer<typeof planningSessionSchema>;

// ADR-83: the flattened lifecycle of one idea — session status/phase while
// planning, then the run status verbatim. Mirrors BUILD_STAGES in
// packages/db (schemas is a leaf package, so the tuple is duplicated the
// same way run statuses are).
export const buildStageSchema = z.enum([
  "clarifying",
  "planning",
  "confirmed",
  "queued",
  "building",
  "testing",
  "reviewing",
  "fixing",
  "shipping",
  "done",
  "failed",
  "abandoned",
]);
export type BuildStage = z.infer<typeof buildStageSchema>;

// GET /api/builds items (ADR-83): one row per idea, whatever its stage.
// `sessionId` targets the planning page while the build is pre-run;
// `latestRunId` targets the run page once one exists.
export const buildListItemSchema = z.object({
  id: z.string().uuid(),
  idea: z.string(),
  stage: buildStageSchema,
  sessionId: z.string().uuid(),
  latestRunId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type BuildListItem = z.infer<typeof buildListItemSchema>;

// Cursor-paginated list envelope (ADR-77). `nextCursor` is an opaque server
// token (keyset on created_at+id) — null means the last page.
export const buildListPageSchema = z.object({
  items: z.array(buildListItemSchema),
  nextCursor: z.string().nullable(),
});
export type BuildListPage = z.infer<typeof buildListPageSchema>;

export const streamEventSchema = z.object({
  id: z.number().int(),
  streamId: z.string().uuid(),
  eventType: z.string(),
  payload: z.unknown(),
});

export type StreamEvent = z.infer<typeof streamEventSchema>;

// M3: start a build run from a frozen Build Spec (Fork B entry).
export const createBuildBodySchema = z.object({
  buildSpecId: z.string().uuid(),
});

export const buildRunSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  userId: z.string(),
  buildSpecId: z.string().uuid(),
  status: z.enum([
    "queued",
    "building",
    "testing",
    "reviewing",
    "fixing",
    "shipping",
    "done",
    "failed",
  ]),
  createdAt: z.string(),
});

export type BuildRun = z.infer<typeof buildRunSchema>;

export const listBuildsQuerySchema = z.object({
  // max(256) bounds the decode work — a real cursor is ~82 chars, so
  // anything larger is garbage; reject it at the schema, not the transport.
  cursor: z.string().min(1).max(256).optional(),
  // Above-cap limits clamp to 50 rather than 400 — a client asking for more
  // just gets the max; garbage (non-numeric, zero, negative) still rejects.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, 50)),
});
export type ListBuildsQuery = z.infer<typeof listBuildsQuerySchema>;

// Task rows as the dashboard timeline consumes them (02 §7.1) — result is
// the TaskResult jsonb, passed through as unknown for the client to narrow.
export const buildTaskSchema = z.object({
  id: z.string().uuid(),
  specTaskId: z.string().nullable(),
  description: z.string(),
  status: z.enum(["pending", "running", "verified", "failed"]),
  attempt: z.number().int(),
  dependsOn: z.array(z.string()),
  result: z.unknown().nullable(),
  createdAt: z.string(),
});
export type BuildTask = z.infer<typeof buildTaskSchema>;
export const buildTaskListSchema = z.array(buildTaskSchema);

// Run-stream SSE payloads (eventType "task") the dashboard renders live.
export const buildStreamTaskEventSchema = z.object({
  specTaskId: z.string(),
  status: z.enum(["running", "verified", "failed"]),
  attempt: z.number().int(),
  turns: z.number().int().optional(),
  costUsd: z.number().optional(),
  reason: z.string().optional(),
});
export type BuildStreamTaskEvent = z.infer<typeof buildStreamTaskEventSchema>;

// M4 (ADR-55): the human escalation decision. `redirect` is the ONE
// free-text-during-build input fed to the Coder — hard-capped as an
// injection/cost guard (ADR-02/07). `specTaskId` targets the decision at the
// task actually at the gate (Phase 3 audit) — the escalation_required event
// carries it, so the client always has it.
export const escalationDecisionBodySchema = z.intersection(
  z.object({ specTaskId: z.string().min(1).max(200) }),
  z.union([
    z.object({ decision: z.enum(["approve", "abandon"]) }),
    z.object({ redirect: z.string().min(1).max(4_000) }),
  ]),
);
export type EscalationDecisionBody = z.infer<typeof escalationDecisionBodySchema>;
