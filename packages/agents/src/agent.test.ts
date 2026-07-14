import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ChatMessage, OpenRouterClient } from "@mullion/llm";
import { runAgent, type AgentSpec } from "./agent.js";
import { parseJsonWith } from "./json.js";

const outputSchema = z.object({ options: z.array(z.string()).max(4) });

const spec: AgentSpec<string, z.infer<typeof outputSchema>> = {
  role: "analyst",
  buildMessages: (input: string): ChatMessage[] => [
    { role: "system", content: "sys" },
    { role: "user", content: input },
  ],
  parse: (content: string) => parseJsonWith(outputSchema, content),
};

const costContext = { organizationId: "org-1" };

function fakeClient(responses: string[]): {
  client: OpenRouterClient;
  calls: { messages: ChatMessage[] }[];
} {
  const calls: { messages: ChatMessage[] }[] = [];
  const completeChat = vi.fn(async (args: { messages: ChatMessage[] }) => {
    calls.push({ messages: args.messages });
    return { content: responses[calls.length - 1]!, model: "m", generationId: "g", cost: 0, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
  });
  return { client: { completeChat } as unknown as OpenRouterClient, calls };
}

describe("runAgent self-repair", () => {
  it("feeds the validation failure back on retry instead of re-asking blind", async () => {
    const bad = '{"options":["a","b","c","d","e"]}';
    const good = '{"options":["a","b","c","d"]}';
    const { client, calls } = fakeClient([bad, good]);

    const result = await runAgent(client, spec, "pick options", costContext);

    expect(result.options).toHaveLength(4);
    expect(calls).toHaveLength(2);
    // First attempt: pristine messages.
    expect(calls[0]!.messages).toHaveLength(2);
    // Retry: prior output echoed as assistant + corrective user instruction.
    const retry = calls[1]!.messages;
    expect(retry).toHaveLength(4);
    expect(retry[2]).toMatchObject({ role: "assistant" });
    expect(retry[2]!.content).toContain('"e"');
    expect(retry[3]!.role).toBe("user");
    expect(retry[3]!.content).toContain("failed validation");
    expect(retry[3]!.content).toContain("<=4");
  });

  it("does not append repair context on a clean first attempt", async () => {
    const { client, calls } = fakeClient(['{"options":["a","b"]}']);
    await runAgent(client, spec, "pick options", costContext);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.messages).toHaveLength(2);
  });
});
