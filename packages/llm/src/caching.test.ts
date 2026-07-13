import { describe, expect, it } from "vitest";
import { applyCacheBreakpoints } from "./caching.js";
import type { ToolChatMessage, ToolDefinition } from "./tools.js";

const tools: ToolDefinition[] = [
  { type: "function", function: { name: "a", description: "A", parameters: {} } },
  { type: "function", function: { name: "b", description: "B", parameters: {} } },
];

const loop: ToolChatMessage[] = [
  { role: "system", content: "You are the Coder." },
  { role: "user", content: "Task t1: build it" },
  { role: "assistant", content: null, tool_calls: [] },
  { role: "tool", tool_call_id: "call_1", content: "exit 0" },
];

describe("applyCacheBreakpoints", () => {
  it("annotates system prompt, last tool definition, and last message", () => {
    const out = applyCacheBreakpoints(loop, tools);

    expect(out.messages[0]).toEqual({
      role: "system",
      content: [
        { type: "text", text: "You are the Coder.", cache_control: { type: "ephemeral" } },
      ],
    });
    // Interior messages untouched.
    expect(out.messages[1]).toBe(loop[1]);
    expect(out.messages[2]).toBe(loop[2]);
    // Moving breakpoint on the newest message, inside the content block.
    expect(out.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: [{ type: "text", text: "exit 0", cache_control: { type: "ephemeral" } }],
    });

    expect(out.tools[0]).toBe(tools[0]);
    expect(out.tools[1]).toEqual({ ...tools[1], cache_control: { type: "ephemeral" } });
  });

  it("skips the moving breakpoint when the newest message is an assistant turn", () => {
    const messages: ToolChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "assistant", content: null, tool_calls: [] },
    ];
    const out = applyCacheBreakpoints(messages, tools);
    expect(out.messages[1]).toBe(messages[1]);
  });

  it("does not double-annotate when the system message is also the newest", () => {
    const messages: ToolChatMessage[] = [{ role: "system", content: "sys" }];
    const out = applyCacheBreakpoints(messages, tools);
    expect(out.messages[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }],
    });
  });

  it("never mutates its inputs", () => {
    const before = JSON.stringify({ loop, tools });
    applyCacheBreakpoints(loop, tools);
    expect(JSON.stringify({ loop, tools })).toBe(before);
  });

  it("handles an empty tools array", () => {
    const out = applyCacheBreakpoints(loop, []);
    expect(out.tools).toEqual([]);
  });
});
