import { testReportSchema, type TestReport } from "@mullion/schemas";
import type { AgentSpec, ChatMessage } from "../agent.js";
import { parseJsonWith } from "../json.js";

/**
 * Tester agent (02 §5.1, fast tier "tester"): "run suite, parse structured
 * output". The runner has already run the suite and holds the exit code —
 * the deterministic pass/fail. This agent's ONLY job is to turn raw test
 * output into a concise, actionable set of failures the Coder can fix next
 * turn. It does not (and structurally cannot) decide pass/fail (ADR-48).
 */

export interface TesterInput {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Bound raw output fed into the prompt — a runaway test log shouldn't blow
// the context or the cost (mirrors the loop's maxToolResultChars discipline).
const MAX_RAW_CHARS = 16_000;

function clip(text: string): string {
  if (text.length <= MAX_RAW_CHARS) return text;
  const half = Math.floor(MAX_RAW_CHARS / 2);
  return `${text.slice(0, half)}\n…[truncated]…\n${text.slice(-half)}`;
}

export const testerAgent: AgentSpec<TesterInput, TestReport> = {
  role: "tester",
  buildMessages(input: TesterInput): ChatMessage[] {
    const system = [
      "You are the Tester agent on an automated build team.",
      "A test command has already been run; you are given its exit code, stdout and stderr.",
      "Summarize the outcome for the Coder as strict JSON with this shape:",
      '{ "summary": string, "failures": string[] }',
      "- summary: one or two sentences on what passed/failed overall.",
      "- failures: each entry names ONE concrete failing test or error with the key detail the Coder needs to fix it. Empty array if nothing failed.",
      "Output ONLY the JSON object, no prose, no code fence.",
    ].join("\n");
    const user = [
      `Command: ${input.command}`,
      `Exit code: ${input.exitCode}`,
      "stdout:",
      clip(input.stdout),
      "stderr:",
      clip(input.stderr),
    ].join("\n");
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  },
  parse(content: string): TestReport {
    return parseJsonWith(testReportSchema, content);
  },
};
