import { describe, expect, it } from "vitest";
import { MalformedLlmResponseError } from "@mullion/llm";
import { testerAgent, type TesterInput } from "./tester.js";

const input: TesterInput = {
  command: "node --test",
  exitCode: 1,
  stdout: "not ok 1 - adds\n  expected 4 got 0",
  stderr: "",
};

describe("testerAgent", () => {
  it("builds a prompt carrying command, exit code and output", () => {
    const messages = testerAgent.buildMessages(input);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("node --test");
    expect(messages[1]?.content).toContain("Exit code: 1");
    expect(messages[1]?.content).toContain("not ok 1");
  });

  it("parses a structured report", () => {
    const report = testerAgent.parse('{"summary":"1 test failed","failures":["adds: expected 4 got 0"]}');
    expect(report.summary).toBe("1 test failed");
    expect(report.failures).toEqual(["adds: expected 4 got 0"]);
  });

  it("defaults failures to [] when omitted", () => {
    const report = testerAgent.parse('{"summary":"all green"}');
    expect(report.failures).toEqual([]);
  });

  it("tolerates a code fence", () => {
    const report = testerAgent.parse('```json\n{"summary":"ok","failures":[]}\n```');
    expect(report.summary).toBe("ok");
  });

  it("rejects non-JSON", () => {
    expect(() => testerAgent.parse("the tests failed badly")).toThrowError(MalformedLlmResponseError);
  });

  it("rejects a report missing the required summary", () => {
    expect(() => testerAgent.parse('{"failures":[]}')).toThrowError(MalformedLlmResponseError);
  });

  it("clips a huge test log in the prompt", () => {
    const big = { ...input, stdout: "x".repeat(50_000) };
    const messages = testerAgent.buildMessages(big);
    expect(messages[1]!.content.length).toBeLessThan(40_000);
    expect(messages[1]!.content).toMatch(/\[truncated \d+ chars\]/);
  });
});
