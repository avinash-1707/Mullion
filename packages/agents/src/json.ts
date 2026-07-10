import type { z } from "zod";
import { MalformedLlmResponseError } from "@mullion/llm";

/**
 * LLM-output JSON handling (CODING_STANDARDS §1: parse-don't-trust, and §3:
 * parsing lives apart from prompting/calling/side-effects).
 */

/** Strips a ```json ... ``` fence if the model wrapped its output in one. */
export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fence?.[1] ?? trimmed;
}

/** Parses one JSON object out of a completion, validated against `schema`. */
export function parseJsonWith<T>(schema: z.ZodType<T>, content: string): T {
  const cleaned = stripCodeFence(content);
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new MalformedLlmResponseError("Agent output was not valid JSON", content);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new MalformedLlmResponseError(
      `Agent output failed schema parse: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      raw,
    );
  }
  return parsed.data;
}

/**
 * Incremental JSONL accumulator for streamed planner output: feed deltas,
 * get back each complete line's parsed value as soon as its newline
 * arrives. A malformed line throws immediately — a half-applied plan is a
 * failure, not a partial success (CODING_STANDARDS §4).
 */
// One decision line tops out well under this even at the schema caps — a
// buffer this large means the model stopped emitting newlines entirely.
const MAX_LINE_CHARS = 64_000;

export class JsonlAccumulator<T> {
  private buffer = "";

  constructor(private readonly schema: z.ZodType<T>) {}

  push(delta: string): T[] {
    this.buffer += delta;
    if (this.buffer.length > MAX_LINE_CHARS) {
      throw new MalformedLlmResponseError(
        `Planner line exceeded ${MAX_LINE_CHARS} chars without a newline`,
        this.buffer.slice(0, 200),
      );
    }
    const out: T[] = [];
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const value = this.parseLine(line);
      if (value !== undefined) out.push(value);
      newlineIndex = this.buffer.indexOf("\n");
    }
    return out;
  }

  /** Call once the stream ends — the final line may lack a trailing \n. */
  flush(): T[] {
    const value = this.parseLine(this.buffer);
    this.buffer = "";
    return value === undefined ? [] : [value];
  }

  private parseLine(line: string): T | undefined {
    const trimmed = line.trim();
    // Blank lines and stray fence markers around the JSONL body are noise,
    // not data — models occasionally add them despite instructions.
    if (trimmed.length === 0 || trimmed === "```" || trimmed === "```json" || trimmed === "```jsonl") {
      return undefined;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new MalformedLlmResponseError("Planner emitted a non-JSON line", trimmed);
    }
    const parsed = this.schema.safeParse(raw);
    if (!parsed.success) {
      throw new MalformedLlmResponseError(
        `Planner line failed schema parse: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        raw,
      );
    }
    return parsed.data;
  }
}
