import { describe, expect, it } from "vitest";
import { markSeen, newlyTouchedNodeKeys, paneOf, type FocusNode } from "../agent-focus";

function node(nodeKey: string, revision = 1, overrides: Partial<FocusNode> = {}): FocusNode {
  return { nodeKey, kind: "service", revision, status: "active", ...overrides };
}

describe("newlyTouchedNodeKeys", () => {
  it("reports an unseen node", () => {
    expect(newlyTouchedNodeKeys([node("api")], new Map())).toEqual(["api"]);
  });

  it("reports a revision bump on a seen node", () => {
    const seen = new Map([["api", 1]]);
    expect(newlyTouchedNodeKeys([node("api", 2)], seen)).toEqual(["api"]);
  });

  it("skips nodes at or below the seen revision", () => {
    const seen = new Map([
      ["api", 2],
      ["db", 1],
    ]);
    expect(newlyTouchedNodeKeys([node("api", 2), node("db", 1)], seen)).toEqual([]);
  });

  it("never reports removed nodes", () => {
    expect(newlyTouchedNodeKeys([node("api", 1, { status: "removed" })], new Map())).toEqual([]);
  });

  it("does not report snapshot-seeded history", () => {
    const snapshot = [node("api"), node("db", 3)];
    const seen = new Map<string, number>();
    markSeen(snapshot, seen);
    expect(newlyTouchedNodeKeys(snapshot, seen)).toEqual([]);
  });

  it("preserves list order for a burst of new nodes", () => {
    const seen = new Map([["api", 1]]);
    const burst = [node("api"), node("worker"), node("queue")];
    expect(newlyTouchedNodeKeys(burst, seen)).toEqual(["worker", "queue"]);
  });

  it("does not mutate the seen map", () => {
    const seen = new Map([["api", 1]]);
    newlyTouchedNodeKeys([node("api", 2)], seen);
    expect(seen.get("api")).toBe(1);
  });
});

describe("markSeen", () => {
  it("records new nodes and bumps revisions, never regressing", () => {
    const seen = new Map([["api", 3]]);
    markSeen([node("api", 2), node("db", 1)], seen);
    expect(seen.get("api")).toBe(3);
    expect(seen.get("db")).toBe(1);
  });
});

describe("paneOf", () => {
  const nodes = [node("api"), node("t1", 1, { kind: "task" }), node("store", 1, { kind: "datastore" })];

  it("routes task nodes to the tasks pane", () => {
    expect(paneOf("t1", nodes)).toBe("tasks");
  });

  it("routes service and datastore nodes to the architecture pane", () => {
    expect(paneOf("api", nodes)).toBe("architecture");
    expect(paneOf("store", nodes)).toBe("architecture");
  });

  it("returns null for an unknown key", () => {
    expect(paneOf("nope", nodes)).toBeNull();
  });
});
