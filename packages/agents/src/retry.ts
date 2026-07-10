import { MalformedLlmResponseError, OpenRouterError } from "@mullion/llm";

/**
 * ADR-30 failure handling for the human-attended planning phase: automatic
 * retry with backoff, then surface an inline error with a manual "try
 * again" — deliberately NOT the build pipeline's retry-budget/escalation
 * machinery (02 §2.4).
 */

const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 750;

export function isRetryableAgentError(error: unknown): boolean {
  if (error instanceof OpenRouterError) return error.retryable;
  // The model answered in the wrong shape — asking again is the fix more
  // often than not.
  if (error instanceof MalformedLlmResponseError) return true;
  return false;
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? BASE_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = attempt === attempts - 1;
      if (isLast || !isRetryableAgentError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  // Unreachable: the loop either returned or threw on its last attempt.
  throw lastError;
}
