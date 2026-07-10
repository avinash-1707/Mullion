import type {
  CompleteChatWithToolsArgs,
  CompleteChatWithToolsResult,
  ToolCall,
} from "@mullion/llm";
import type { ToolCallingLlm } from "../build-task.js";

/**
 * Hand-authored adversarial transcripts (locked plan decision #5): scripted
 * multi-turn tool-call sequences on the REAL wire shape, so the loop's
 * failure handling is exercised deterministically. Recorded/replayed real
 * transcripts arrive with a real key + the Phase-3 replay cache (ADR-11).
 */

export function toolCall(id: string, name: string, args: unknown): ToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
  };
}

export interface ScriptedTurn {
  content?: string | null;
  toolCalls?: ToolCall[];
  cost?: number;
  /** Throw instead of answering. */
  error?: Error;
  /**
   * Throw `error` this many times BEFORE resolving this turn, without
   * advancing — models a transport error that withBackoff retries through.
   * Requires `error` to be set. Default 0 (throw once and advance, the
   * terminal-failure case).
   */
  throwTimes?: number;
}

export class ScriptedLlm implements ToolCallingLlm {
  readonly requests: CompleteChatWithToolsArgs[] = [];
  private readonly turns: ScriptedTurn[];
  private cursor = 0;
  private thrownForCursor = 0;

  constructor(turns: ScriptedTurn[]) {
    this.turns = turns;
  }

  async completeChatWithTools(
    args: CompleteChatWithToolsArgs,
  ): Promise<CompleteChatWithToolsResult> {
    this.requests.push(args);
    const turn = this.turns[this.cursor];
    if (!turn) {
      throw new Error(`ScriptedLlm exhausted after ${this.cursor} turns`);
    }
    // Transient-then-recover: throw up to throwTimes without advancing.
    if (turn.error && turn.throwTimes && this.thrownForCursor < turn.throwTimes) {
      this.thrownForCursor += 1;
      throw turn.error;
    }
    this.thrownForCursor = 0;
    this.cursor += 1;
    if (turn.error && !turn.throwTimes) throw turn.error;
    return {
      content: turn.content ?? null,
      toolCalls: turn.toolCalls ?? [],
      finishReason: (turn.toolCalls?.length ?? 0) > 0 ? "tool_calls" : "stop",
      model: "test/coder-model",
      generationId: `gen-${this.cursor}`,
      cost: turn.cost ?? 0.001,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    };
  }
}
