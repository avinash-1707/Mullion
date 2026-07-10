import { z } from "zod";

// 02 §2.5 — the one artifact both forks consume.
export const buildSpecArtifactSchema = z.object({
  build_spec_id: z.string().uuid(),
  content_hash: z.string().startsWith("sha256:"),
  requirements: z.record(z.string(), z.unknown()),
  architecture_graph: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
  task_graph: z.array(
    z.object({
      task_id: z.string(),
      description: z.string(),
      acceptance_criteria: z.string(),
      depends_on: z.array(z.string()),
    }),
  ),
  decision_log_ids: z.array(z.string().uuid()),
  frozen_at: z.string().datetime(),
});

export type BuildSpecArtifact = z.infer<typeof buildSpecArtifactSchema>;
