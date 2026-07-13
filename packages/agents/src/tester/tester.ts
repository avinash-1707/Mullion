import { testReportSchema, type TestReport } from "@mullion/schemas";
import type { AgentSpec, ChatMessage } from "../agent.js";
import { parseJsonWith } from "../json.js";
import { truncateMiddle } from "../truncate.js";

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

export const testerAgent: AgentSpec<TesterInput, TestReport> = {
  role: "tester",
  buildMessages(input: TesterInput): ChatMessage[] {
    const system = [
      "You are the Tester agent on an automated build team.",
      "A test command has already been run; you are given its exit code, stdout and stderr.",
      "Exit code 0 means the run passed; non-zero means it failed. You do NOT decide pass/fail — the exit code already did. Your only job is to explain the output.",
      "Long output may be clipped in the middle, marked with an …[truncated N chars]… line — never treat the truncation marker as an error.",
      "Summarize the outcome for the Coder as strict JSON with this shape:",
      '{ "summary": string, "failures": string[] }',
      "- summary: one or two sentences on what passed/failed overall.",
      "- failures: each entry names ONE concrete failing test or error with the key detail the Coder needs to fix it (test name, expected vs actual, or the error message and location). Empty array if nothing failed. At most 10 entries, most important first — fold repeats of the same root cause into one entry.",
      "Output ONLY the JSON object, no prose, no code fence.",
    ].join("\n");
    const user = [
      `Command: ${input.command}`,
      `Exit code: ${input.exitCode}`,
      "stdout:",
      truncateMiddle(input.stdout, MAX_RAW_CHARS),
      "stderr:",
      truncateMiddle(input.stderr, MAX_RAW_CHARS),
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
