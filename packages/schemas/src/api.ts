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

export const buildRunListSchema = z.array(buildRunSchema);

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
