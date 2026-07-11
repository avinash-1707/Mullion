import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeArtifactPath } from "./port.js";
import { InMemoryArtifactStore } from "./fake.js";
import { LocalFsArtifactStore } from "./local-fs.js";
import { createArtifactStore } from "./select.js";
import type { ArtifactStore } from "./port.js";

describe("assertSafeArtifactPath", () => {
  it("strips leading slashes and normalizes", () => {
    expect(assertSafeArtifactPath("/src/a.ts")).toBe("src/a.ts");
    expect(assertSafeArtifactPath("a/./b.ts")).toBe("a/b.ts");
  });
  it("rejects traversal and empty", () => {
    expect(() => assertSafeArtifactPath("../etc")).toThrowError(/escapes/);
    expect(() => assertSafeArtifactPath("a/../../b")).toThrowError(/escapes/);
    expect(() => assertSafeArtifactPath("///")).toThrowError(/empty/);
  });
});

describe("createArtifactStore", () => {
  it("selects local", () => {
    expect(createArtifactStore({ store: "local", localDir: "/tmp/x" })).toBeInstanceOf(LocalFsArtifactStore);
  });
  it("refuses s3 without a bucket", () => {
    expect(() => createArtifactStore({ store: "s3" })).toThrowError(/ARTIFACT_S3_BUCKET/);
  });
});

// Contract tests run against both the in-memory fake and the real fs store.
function contract(name: string, make: () => Promise<{ store: ArtifactStore; cleanup: () => Promise<void> }>) {
  describe(`ArtifactStore contract — ${name}`, () => {
    let store: ArtifactStore;
    let cleanup: () => Promise<void>;
    beforeEach(async () => {
      ({ store, cleanup } = await make());
    });
    afterEach(async () => {
      await cleanup();
    });

    it("puts and reads a tree", async () => {
      await store.put("run-1", [
        { path: "src/a.ts", content: "A" },
        { path: "readme.md", content: "R" },
      ]);
      const tree = await store.readTree("run-1");
      expect(tree).toEqual([
        { path: "readme.md", content: "R" },
        { path: "src/a.ts", content: "A" },
      ]);
      expect(await store.list("run-1")).toEqual(["readme.md", "src/a.ts"]);
    });

    it("last-writer-wins per path across puts (union accumulation)", async () => {
      await store.put("run-1", [{ path: "a.ts", content: "v1" }]);
      await store.put("run-1", [{ path: "a.ts", content: "v2" }, { path: "b.ts", content: "B" }]);
      const tree = await store.readTree("run-1");
      expect(tree).toEqual([
        { path: "a.ts", content: "v2" },
        { path: "b.ts", content: "B" },
      ]);
    });

    it("isolates runs", async () => {
      await store.put("run-1", [{ path: "a.ts", content: "one" }]);
      await store.put("run-2", [{ path: "a.ts", content: "two" }]);
      expect(await store.readTree("run-1")).toEqual([{ path: "a.ts", content: "one" }]);
      expect(await store.readTree("run-2")).toEqual([{ path: "a.ts", content: "two" }]);
    });

    it("empty run reads as an empty tree", async () => {
      expect(await store.readTree("nope")).toEqual([]);
    });

    it("rejects an unsafe path on put", async () => {
      await expect(store.put("run-1", [{ path: "../escape", content: "x" }])).rejects.toThrowError(/escapes/);
    });
  });
}

contract("in-memory", async () => ({
  store: new InMemoryArtifactStore(),
  cleanup: async () => undefined,
}));

contract("local-fs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mullion-artifacts-"));
  return {
    store: new LocalFsArtifactStore(dir),
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
});
