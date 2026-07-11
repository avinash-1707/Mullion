import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { InMemoryArtifactStore } from "@mullion/artifacts/testing";
import { ArchiveDeliveryTarget } from "./archive.js";
import { GitHubDeliveryTarget, type OctokitLike } from "./github.js";
import { FakeArchiveDeliveryTarget, FakeGitHubDeliveryTarget } from "./fake.js";
import type { DeliveryRequest } from "./port.js";

function req(over?: Partial<DeliveryRequest>): DeliveryRequest {
  return {
    runId: "run-1",
    organizationId: "org-1",
    userId: "user-1",
    repo: [{ path: "sum.js", content: "exports.sum=(a,b)=>a+b" }],
    repoName: "demo",
    isPartial: false,
    summary: "Built the sum library.",
    ...over,
  };
}

describe("ArchiveDeliveryTarget", () => {
  it("zips the repo + a build summary and stores it", async () => {
    const store = new InMemoryArtifactStore();
    let capturedZip: Buffer | undefined;
    const target = new ArchiveDeliveryTarget(store, async (runId, name, zip) => {
      capturedZip = zip;
      return `artifacts://${runId}/${name}`;
    });
    const result = await target.deliver(req());
    expect(result.kind).toBe("archive");
    expect(result.ref).toBe("artifacts://run-1/demo.zip");
    // The zip really contains the repo + the summary.
    const unzipped = await JSZip.loadAsync(capturedZip!);
    expect(Object.keys(unzipped.files).sort()).toEqual(["MULLION_BUILD.md", "sum.js"]);
    expect(await unzipped.file("sum.js")!.async("string")).toContain("a+b");
  });

  it("is always available", async () => {
    const target = new ArchiveDeliveryTarget(new InMemoryArtifactStore(), async () => "x");
    expect(await target.available()).toBe(true);
  });

  it("marks a partial build in the summary file", async () => {
    let zip: Buffer | undefined;
    const target = new ArchiveDeliveryTarget(new InMemoryArtifactStore(), async (_r, _n, z) => {
      zip = z;
      return "x";
    });
    await target.deliver(req({ isPartial: true, summary: "task b abandoned" }));
    const unzipped = await JSZip.loadAsync(zip!);
    const md = await unzipped.file("MULLION_BUILD.md")!.async("string");
    expect(md).toContain("PARTIAL / INCOMPLETE BUILD");
    expect(md).toContain("task b abandoned");
  });
});

describe("GitHubDeliveryTarget", () => {
  function fakeOctokit(calls: string[]): OctokitLike {
    return {
      rest: {
        users: {
          getAuthenticated: vi.fn(async () => ({ data: { login: "u" } })),
        },
        repos: {
          createForAuthenticatedUser: vi.fn(async ({ name }) => {
            calls.push(`create:${name}`);
            return { data: { name, owner: { login: "u" }, default_branch: "main", html_url: `https://github.com/u/${name}` } };
          }),
          get: vi.fn(async ({ repo }) => {
            calls.push(`get:${repo}`);
            return { data: { name: repo, owner: { login: "u" }, default_branch: "main", html_url: `https://github.com/u/${repo}` } };
          }),
        },
        git: {
          createBlob: vi.fn(async ({ content }) => {
            calls.push(`blob:${content.slice(0, 8)}`);
            return { data: { sha: `sha-${calls.length}` } };
          }),
          createTree: vi.fn(async ({ tree }) => {
            calls.push(`tree:${(tree as unknown[]).length}`);
            return { data: { sha: "tree-sha" } };
          }),
          createCommit: vi.fn(async () => {
            calls.push("commit");
            return { data: { sha: "commit-sha" } };
          }),
          createRef: vi.fn(async ({ ref }) => {
            calls.push(`ref:${ref}`);
            return {};
          }),
        },
      },
    };
  }

  it("available() reflects whether a token is linked", async () => {
    const linked = new GitHubDeliveryTarget(async () => "tok", () => fakeOctokit([]));
    const unlinked = new GitHubDeliveryTarget(async () => null, () => fakeOctokit([]));
    expect(await linked.available("u")).toBe(true);
    expect(await unlinked.available("u")).toBe(false);
  });

  it("creates a repo and pushes blob→tree→commit→ref", async () => {
    const calls: string[] = [];
    const target = new GitHubDeliveryTarget(async () => "tok", () => fakeOctokit(calls));
    const result = await target.deliver(req());
    expect(result.kind).toBe("github");
    expect(result.ref).toBe("https://github.com/u/demo");
    // repo + 2 blobs (sum.js + summary) + tree + commit + ref
    expect(calls[0]).toBe("create:demo");
    expect(calls.filter((c) => c.startsWith("blob:"))).toHaveLength(2);
    expect(calls).toContain("tree:2");
    expect(calls).toContain("commit");
    expect(calls).toContain("ref:refs/heads/main");
  });

  it("resumes into an existing repo when creation 422s (crash-retry idempotency)", async () => {
    const calls: string[] = [];
    const octokit = fakeOctokit(calls);
    (octokit.rest.repos.createForAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("name already exists"), { status: 422 }),
    );
    const target = new GitHubDeliveryTarget(async () => "tok", () => octokit);
    const result = await target.deliver(req());
    expect(result.ref).toBe("https://github.com/u/demo");
    expect(calls).toContain("get:demo");
    expect(calls).toContain("ref:refs/heads/main");
  });

  it("treats an existing ref as already-delivered instead of failing", async () => {
    const calls: string[] = [];
    const octokit = fakeOctokit(calls);
    (octokit.rest.git.createRef as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("Reference already exists"), { status: 422 }),
    );
    const target = new GitHubDeliveryTarget(async () => "tok", () => octokit);
    const result = await target.deliver(req());
    expect(result.kind).toBe("github");
    expect(result.ref).toBe("https://github.com/u/demo");
  });

  it("throws when no token is linked", async () => {
    const target = new GitHubDeliveryTarget(async () => null, () => fakeOctokit([]));
    await expect(target.deliver(req())).rejects.toThrowError(/no linked GitHub token/);
  });
});

describe("fakes", () => {
  it("FakeGitHub captures the pushed tree only for connected users", async () => {
    const target = new FakeGitHubDeliveryTarget();
    await expect(target.deliver(req())).rejects.toThrow();
    target.connect("user-1");
    const result = await target.deliver(req());
    expect(result.ref).toBe("fake://github/demo");
    expect(target.remotes.get("demo")!.map((f) => f.path).sort()).toEqual(["MULLION_BUILD.md", "sum.js"]);
  });

  it("FakeArchive captures the archived tree", async () => {
    const target = new FakeArchiveDeliveryTarget();
    await target.deliver(req({ isPartial: true, summary: "partial" }));
    expect(target.archives.get("demo")!.some((f) => f.path === "MULLION_BUILD.md")).toBe(true);
  });
});
