import { z } from "zod";

// Build Reviewer output (02 §5, M4). Read-only, advisory (ADR-54): the
// verdict is recorded and flags the delivery summary, but a blocker does NOT
// auto-loop a fix cycle (that's the deferred `fixing` phase). Like the
// planning consistency reviewer, its trust is advisory — the LLM reads code
// derived from user input, so a "pass" is never a security boundary.

export const buildReviewNoteSchema = z.object({
  severity: z.enum(["blocker", "concern"]),
  message: z.string().max(2_000),
  paths: z.array(z.string().max(512)).max(20).default([]),
});
export type BuildReviewNote = z.infer<typeof buildReviewNoteSchema>;

export const buildReviewVerdictSchema = z.object({
  approved: z.boolean(),
  notes: z.array(buildReviewNoteSchema).max(50).default([]),
});
export type BuildReviewVerdict = z.infer<typeof buildReviewVerdictSchema>;
