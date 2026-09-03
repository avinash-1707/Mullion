import { describe, expect, it } from "vitest";
import { MalformedLlmResponseError } from "../errors.js";
import { parseChatCompletion } from "../response.js";

const validResponse = {
  id: "gen-abc123",
  model: "placeholder/model",
  choices: [
    {
      message: { role: "assistant", content: "hello world" },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 2,
    total_tokens: 12,
    cost: 0.00012,
  },
};

describe("parseChatCompletion", () => {
  it("accepts a well-formed response", () => {
    const parsed = parseChatCompletion(validResponse);
    expect(parsed.choices[0]?.message.content).toBe("hello world");
    expect(parsed.usage.cost).toBe(0.00012);
  });

  it("rejects a response missing usage.cost", () => {
    const { cost: _cost, ...usageWithoutCost } = validResponse.usage;
    expect(() =>
      parseChatCompletion({ ...validResponse, usage: usageWithoutCost }),
    ).toThrow(MalformedLlmResponseError);
  });

  it("rejects a response with no choices", () => {
    expect(() => parseChatCompletion({ ...validResponse, choices: [] })).toThrow(
      MalformedLlmResponseError,
    );
  });

  it("rejects free-text garbage", () => {
    expect(() => parseChatCompletion("I'm sorry, something went wrong")).toThrow(
      MalformedLlmResponseError,
    );
  });
});
