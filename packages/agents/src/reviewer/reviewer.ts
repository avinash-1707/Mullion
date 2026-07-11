import { buildReviewVerdictSchema, type BuildReviewVerdict } from "@mullion/schemas";
import type { AgentSpec, ChatMessage } from "../agent.js";
import { parseJsonWith } from "../json.js";

/**
 * Build Reviewer (02 §5, M4, ADR-54): a one-shot, read-only review of the
 * produced repo against the task acceptance criteria and the decision log.
 * Advisory — its verdict is recorded and flags delivery, but does not
 * auto-loop a fix cycle. Trust note mirrors the planning consistency
 * reviewer: it reads code derived from user input, so a "pass" is never a
 * security boundary.
 */

// Feed a bounded slice of the tree — a large repo can't blow context/cost.
const MAX_REVIEW_CHARS = 60_000;

export interface BuildReviewInput {
  requirementsSummary: string;
  tasks: { taskId: string; acceptanceCriteria: string; status: string }[];
  decisionLog: { actor: string; decision: string }[];
  files: { path: string; content: string }[];
}

function renderFiles(files: { path: string; content: string }[]): string {
  const out: string[] = [];
  let budget = MAX_REVIEW_CHARS;
  // Smallest-first so a couple of huge files don't starve everything.
  const ordered = [...files].sort((a, b) => a.content.length - b.content.length);
  const omitted: string[] = [];
  for (const file of ordered) {
    const block = `--- ${file.path} ---\n${file.content}\n`;
    if (block.length > budget) {
      omitted.push(file.path);
      continue;
    }
    out.push(block);
    budget -= block.length;
  }
  if (omitted.length > 0) {
    out.push(`--- [omitted for size: ${omitted.join(", ")}] ---`);
  }
  return out.join("\n");
}

const SYSTEM = `You are the Reviewer agent for Mullion, reviewing a build the Coder produced. You have READ-ONLY access; you do not run or change code.

Review the produced files against each task's acceptance criteria and the decision log. Report ONLY genuine problems:
- "blocker": the code fails to meet an acceptance criterion, contradicts a logged decision, or is broken.
- "concern": a real quality/correctness risk worth noting but not disqualifying.
Do not report style opinions or nice-to-haves. Approve (approved:true, empty notes) when the code plausibly meets the criteria.

Respond with STRICT JSON only, no markdown fences: {"approved": boolean, "notes": [{"severity": "blocker" | "concern", "message": string, "paths": [string]}]}`;

export const buildReviewerAgent: AgentSpec<BuildReviewInput, BuildReviewVerdict> = {
  role: "reviewer",
  temperature: 0,
  maxTokens: 2_000,
  buildMessages(input: BuildReviewInput): ChatMessage[] {
    const tasks = input.tasks
      .map((t) => `- ${t.taskId} [${t.status}]: ${t.acceptanceCriteria}`)
      .join("\n");
    const decisions = input.decisionLog.map((d) => `- (${d.actor}) ${d.decision}`).join("\n");
    return [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `Requirements: ${input.requirementsSummary}`,
          "",
          "Tasks & acceptance criteria:",
          tasks || "(none)",
          "",
          "Decision log:",
          decisions || "(none)",
          "",
          "Produced files:",
          renderFiles(input.files),
        ].join("\n"),
      },
    ];
  },
  parse(content: string): BuildReviewVerdict {
    return parseJsonWith(buildReviewVerdictSchema, content);
  },
};
