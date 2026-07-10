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
]);
export type TaskFailureReason = z.infer<typeof taskFailureReasonSchema>;

/** Persisted into tasks.result at loop end. */
export const taskResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("verified"),
    turns: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    status: z.literal("failed"),
    reason: taskFailureReasonSchema,
    detail: z.string().max(2_000).optional(),
    turns: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
]);
export type TaskResult = z.infer<typeof taskResultSchema>;
