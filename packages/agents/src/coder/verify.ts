import type { CostContext } from "@mullion/llm";
import type { Sandbox } from "@mullion/sandbox";

/**
 * The verification step `submit` triggers. Pulled out of buildTask as an
 * injectable dependency so M2's Tester-backed, tamper-proof verifier
 * (fresh sandbox + runner-owned tests) is an additive swap, not a rewrite —
 * and M1's inline behavior stays the default.
 */

export interface VerifyContext {
  /** The Coder's live build sandbox. */
  buildSandbox: Sandbox;
  /** Paths the Coder has written this task (for copying source into a fresh verify sandbox). */
  writtenPaths: ReadonlySet<string>;
  /** The runner-owned command that defines success — never model-supplied. */
  verifyCommand: string;
  commandTimeoutMs: number;
  costContext: CostContext;
}

export interface VerificationResult {
  passed: boolean;
  exitCode: number;
  /** Fed back to the Coder verbatim on failure. */
  feedback: string;
  /** LLM cost the verifier itself incurred (Tester agent); 0 for the inline verifier. */
  costUsd: number;
  /** Structured report, when a Tester agent parsed the output (M2). */
  report?: { failures: string[]; summary: string };
}

export type Verifier = (ctx: VerifyContext) => Promise<VerificationResult>;

/**
 * M1 default: run the verify command in the Coder's own sandbox, exit 0 =
 * pass. Honest about its limit (ADR-46): the Coder wrote this tree, so this
 * proves "the model satisfied the command," not independent acceptance —
 * that is what M2's testerVerifier replaces it with.
 */
export const inlineVerifier: Verifier = async (ctx: VerifyContext): Promise<VerificationResult> => {
  const result = await ctx.buildSandbox.runCommand(ctx.verifyCommand, {
    timeoutMs: ctx.commandTimeoutMs,
  });
  return {
    passed: result.exitCode === 0,
    exitCode: result.exitCode,
    feedback: `exit ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    costUsd: 0,
  };
};
