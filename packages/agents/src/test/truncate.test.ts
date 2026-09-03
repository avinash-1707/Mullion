import { describe, expect, it } from "vitest";
import { truncateMiddle } from "../truncate.js";

describe("truncateMiddle", () => {
  it("returns short text unchanged", () => {
    expect(truncateMiddle("hello", 10)).toBe("hello");
  });

  it("keeps head and tail and marks the dropped middle", () => {
    const text = `${"a".repeat(100)}${"b".repeat(100)}`;
    const out = truncateMiddle(text, 40);
    expect(out.startsWith("a".repeat(20))).toBe(true);
    expect(out.endsWith("b".repeat(20))).toBe(true);
    expect(out).toContain("[truncated 160 chars]");
  });
});
