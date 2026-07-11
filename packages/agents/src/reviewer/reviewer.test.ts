import { describe, expect, it } from "vitest";
import { MalformedLlmResponseError } from "@mullion/llm";
import { buildReviewerAgent, type BuildReviewInput } from "./reviewer.js";

const input: BuildReviewInput = {
  requirementsSummary: "A sum library",
  tasks: [{ taskId: "t1", acceptanceCriteria: "sum(2,3)===5", status: "verified" }],
  decisionLog: [{ actor: "planner", decision: "expose sum(a,b)" }],
  files: [{ path: "sum.js", content: "exports.sum=(a,b)=>a+b" }],
};

describe("buildReviewerAgent", () => {
  it("builds a prompt with tasks, decisions, and files", () => {
    const messages = buildReviewerAgent.buildMessages(input);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("sum(2,3)===5");
    expect(messages[1]?.content).toContain("expose sum(a,b)");
    expect(messages[1]?.content).toContain("sum.js");
  });

  it("parses an approve verdict", () => {
    const v = buildReviewerAgent.parse('{"approved":true,"notes":[]}');
    expect(v.approved).toBe(true);
    expect(v.notes).toEqual([]);
  });

  it("parses a blocker verdict", () => {
    const v = buildReviewerAgent.parse(
      '{"approved":false,"notes":[{"severity":"blocker","message":"missing export","paths":["sum.js"]}]}',
    );
    expect(v.approved).toBe(false);
    expect(v.notes[0]?.severity).toBe("blocker");
  });

  it("rejects non-JSON", () => {
    expect(() => buildReviewerAgent.parse("looks good to me")).toThrowError(MalformedLlmResponseError);
  });

  it("omits oversized files but keeps the review runnable", () => {
    const big: BuildReviewInput = {
      ...input,
      files: [
        { path: "small.js", content: "x" },
        { path: "huge.js", content: "y".repeat(80_000) },
      ],
    };
    const content = buildReviewerAgent.buildMessages(big)[1]!.content;
    expect(content).toContain("small.js");
    expect(content).toContain("omitted for size: huge.js");
    expect(content.length).toBeLessThan(70_000);
  });
});
