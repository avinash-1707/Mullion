import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MalformedLlmResponseError } from "@mullion/llm";
import { JsonlAccumulator, parseJsonWith, stripCodeFence } from "./json.js";

describe("stripCodeFence", () => {
  it("strips a json fence", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("leaves bare JSON alone", () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("parseJsonWith", () => {
  const schema = z.object({ a: z.number() });
  it("parses fenced output", () => {
    expect(parseJsonWith(schema, '```json\n{"a": 2}\n```')).toEqual({ a: 2 });
  });
  it("throws typed error on non-JSON", () => {
    expect(() => parseJsonWith(schema, "not json")).toThrow(MalformedLlmResponseError);
  });
  it("throws typed error on schema mismatch", () => {
    expect(() => parseJsonWith(schema, '{"a": "no"}')).toThrow(MalformedLlmResponseError);
  });
});

describe("JsonlAccumulator", () => {
  const schema = z.object({ n: z.number() });

  it("yields complete lines across arbitrary chunk boundaries", () => {
    const acc = new JsonlAccumulator(schema);
    const out = [
      ...acc.push('{"n"'),
      ...acc.push(": 1}\n{"),
      ...acc.push('"n": 2}\n'),
    ];
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("flush parses a final line without trailing newline", () => {
    const acc = new JsonlAccumulator(schema);
    expect(acc.push('{"n": 1}')).toEqual([]);
    expect(acc.flush()).toEqual([{ n: 1 }]);
  });

  it("ignores blank lines and stray fences", () => {
    const acc = new JsonlAccumulator(schema);
    const out = acc.push('```jsonl\n{"n": 1}\n\n```\n');
    expect(out).toEqual([{ n: 1 }]);
    expect(acc.flush()).toEqual([]);
  });

  it("throws on a malformed line — never a silent partial plan", () => {
    const acc = new JsonlAccumulator(schema);
    expect(() => acc.push('{"n": oops}\n')).toThrow(MalformedLlmResponseError);
  });
});
