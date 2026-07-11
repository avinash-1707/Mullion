import { z } from "zod";

// Tester output (02 §5.1: "run suite, parse structured output"). The LLM
// parses messy test output into structured, actionable failures fed back to
// the Coder — it does NOT decide pass/fail. `passed` is set by the runner
// from the real exit code (ADR-48); the agent only fills failures/summary.

export const testReportSchema = z.object({
  failures: z.array(z.string().max(2_000)).max(50).default([]),
  summary: z.string().max(4_000),
});
export type TestReport = z.infer<typeof testReportSchema>;

/** Full verification outcome: deterministic pass/fail + the parsed report. */
export const verificationOutcomeSchema = z.object({
  passed: z.boolean(),
  exitCode: z.number().int(),
  report: testReportSchema,
});
export type VerificationOutcome = z.infer<typeof verificationOutcomeSchema>;
