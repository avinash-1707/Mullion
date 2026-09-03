import { describe, expect, it } from "vitest";
import { MalformedLlmResponseError } from "@mullion/llm";
import { analystQuestionAgent, analystRequirementsAgent } from "../analyst.js";

describe("analystQuestionAgent.parse", () => {
  it("parses questions and assigns fresh uuids", () => {
    const content = JSON.stringify({
      questions: [
        {
          text: "How will users authenticate?",
          type: "single_select",
          options: ["Email + password", "OAuth", "None"],
          affects: ["auth_model"],
        },
      ],
    });
    const questions = analystQuestionAgent.parse(content);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(questions[0]?.options).toHaveLength(3);
  });

  it("accepts an empty round (no follow-ups needed)", () => {
    expect(analystQuestionAgent.parse('{"questions": []}')).toEqual([]);
  });

  it("rejects a question with too many options", () => {
    const content = JSON.stringify({
      questions: [
        { text: "x", type: "single_select", options: ["a", "b", "c", "d", "e"], affects: [] },
      ],
    });
    expect(() => analystQuestionAgent.parse(content)).toThrow(MalformedLlmResponseError);
  });
});

describe("analystRequirementsAgent.parse", () => {
  it("parses a full requirements document", () => {
    const doc = {
      summary: "A URL shortener for internal links.",
      functionalRequirements: ["Shorten a URL", "Redirect on hit"],
      nonFunctionalConstraints: ["Sub-100ms redirects"],
      assumptions: ["No custom domains in v1"],
      scope: { inV1: ["Shortening", "Redirects"], outOfV1: ["Analytics"] },
    };
    expect(analystRequirementsAgent.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it("rejects a doc without functional requirements", () => {
    const doc = {
      summary: "x",
      functionalRequirements: [],
      nonFunctionalConstraints: [],
      assumptions: [],
      scope: { inV1: ["y"], outOfV1: [] },
    };
    expect(() => analystRequirementsAgent.parse(JSON.stringify(doc))).toThrow(
      MalformedLlmResponseError,
    );
  });
});

describe("prompt construction", () => {
  it("includes prior answers in round-2 messages", () => {
    const messages = analystQuestionAgent.buildMessages({
      idea: "a todo app",
      roundNumber: 2,
      priorRounds: [
        {
          round: 1,
          questions: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              text: "Multi-user?",
              type: "single_select",
              options: ["Yes", "No"],
              affects: ["user_model"],
            },
          ],
          answers: [
            {
              questionId: "11111111-1111-4111-8111-111111111111",
              selectedOptions: ["Yes"],
            },
          ],
        },
      ],
    });
    const user = messages.find((m) => m.role === "user");
    expect(user?.content).toContain("Multi-user?");
    expect(user?.content).toContain("Yes");
    expect(user?.content).toContain("FINAL round");
  });
});
