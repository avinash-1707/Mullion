import { createRecordReplayFetch } from "@mullion/llm";
import { env } from "../config/env.js";

/**
 * Shared by the API process and the build worker so both record into / replay
 * from the same cassette directory (ADR-11) — a build captured by the worker
 * replays identically under the planning service's tests and vice versa.
 */
export const llmFetchImpl =
  env.LLM_REPLAY_MODE === "off"
    ? undefined
    : createRecordReplayFetch({ mode: env.LLM_REPLAY_MODE, dir: env.LLM_CASSETTE_DIR });
