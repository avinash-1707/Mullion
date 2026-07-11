import { z } from "zod";

// Tool-argument schemas for the Coder loop (ADR-45). LLM output crossing
// into the sandbox is parse-don't-trust with hard caps (Phase-1 payload
// discipline): a runaway generation can't blow the transcript, the tmpfs,
// or the DB row.

export const writeFileArgsSchema = z.object({
  path: z.string().min(1).max(512),
  content: z.string().max(256 * 1024),
});
export type WriteFileArgs = z.infer<typeof writeFileArgsSchema>;

export const readFileArgsSchema = z.object({
  path: z.string().min(1).max(512),
});
export type ReadFileArgs = z.infer<typeof readFileArgsSchema>;

export const runCommandArgsSchema = z.object({
  cmd: z.string().min(1).max(4_096),
});
export type RunCommandArgs = z.infer<typeof runCommandArgsSchema>;

export const submitArgsSchema = z.object({}).loose();
export type SubmitArgs = z.infer<typeof submitArgsSchema>;

export const coderToolNameSchema = z.enum(["writeFile", "readFile", "runCommand", "submit"]);
export type CoderToolName = z.infer<typeof coderToolNameSchema>;

/** Task status lifecycle (text column + TS enum, model_routing precedent). */
export const taskStatusSchema = z.enum(["pending", "running", "verified", "failed"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskFailureReasonSchema = z.enum([
  "turn_cap",
  "time_cap",
  "cost_cap",
  "sandbox_died",
  "llm_error",
  "protocol",
  "crashed",
  // M2: the test-fix cycle budget was exhausted without the runner-owned
  // tests passing.
  "test_failed",
  // M2: ADR-31 combined budget circuit breaker tripped mid-task.
  "budget_exceeded",
]);
export type TaskFailureReason = z.infer<typeof taskFailureReasonSchema>;

// Paths the Coder wrote this task (M4, ADR-53) — the runner snapshots these
// into the artifact store so Reviewer/DevOps have a durable tree. Capped; only
// writeFile-tracked paths (ADR-48 known-limit b).
const producedPathsSchema = z.array(z.string().max(512)).max(2_000).default([]);

/** Persisted into tasks.result at loop end. */
export const taskResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("verified"),
    turns: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    producedPaths: producedPathsSchema,
  }),
  z.object({
    status: z.literal("failed"),
    reason: taskFailureReasonSchema,
    detail: z.string().max(2_000).optional(),
    turns: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    producedPaths: producedPathsSchema,
  }),
]);
export type TaskResult = z.infer<typeof taskResultSchema>;
