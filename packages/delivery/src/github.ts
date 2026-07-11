import { Octokit } from "@octokit/rest";
import { deliverySummaryFile, type DeliveryRequest, type DeliveryResult, type DeliveryTarget } from "./port.js";

/**
 * GitHub delivery (ADR-54, spec §8/§11): create a fresh private repo and push
 * the produced tree as one commit via the git-data API (blobs → tree →
 * commit → ref). Scope `repo` only (ADR-23). No git binary needed. The
 * access token is per-user (ADR-36), read from Better Auth's account table
 * at delivery time only.
 */

/** Resolve the caller's linked GitHub token, or null if not connected. */
export type GitHubTokenResolver = (userId: string) => Promise<string | null>;

/** Minimal Octokit surface — a fake satisfies this in tests. */
export interface OctokitLike {
  rest: {
    repos: { createForAuthenticatedUser(args: { name: string; private: boolean }): Promise<{ data: { name: string; owner: { login: string }; default_branch: string; html_url: string } }> };
    git: {
      createBlob(args: { owner: string; repo: string; content: string; encoding: string }): Promise<{ data: { sha: string } }>;
      createTree(args: { owner: string; repo: string; tree: unknown[] }): Promise<{ data: { sha: string } }>;
      createCommit(args: { owner: string; repo: string; message: string; tree: string; parents: string[] }): Promise<{ data: { sha: string } }>;
      createRef(args: { owner: string; repo: string; ref: string; sha: string }): Promise<unknown>;
    };
  };
}

export class GitHubDeliveryTarget implements DeliveryTarget {
  readonly kind = "github" as const;

  constructor(
    private readonly resolveToken: GitHubTokenResolver,
    /** Injectable for tests; defaults to a real Octokit built from the token. */
    private readonly makeClient: (token: string) => OctokitLike = (token) =>
      new Octokit({ auth: token }) as unknown as OctokitLike,
  ) {}

  async available(userId: string): Promise<boolean> {
    return (await this.resolveToken(userId)) !== null;
  }

  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    const token = await this.resolveToken(req.userId);
    if (!token) throw new Error("no linked GitHub token for user — cannot push");
    const gh = this.makeClient(token);

    const { data: repo } = await gh.rest.repos.createForAuthenticatedUser({
      name: req.repoName,
      private: true,
    });
    const owner = repo.owner.login;

    const files = [...req.repo, deliverySummaryFile(req)];
    const tree = [];
    for (const file of files) {
      const { data: blob } = await gh.rest.git.createBlob({
        owner,
        repo: repo.name,
        content: file.content,
        encoding: "utf-8",
      });
      tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const { data: created } = await gh.rest.git.createTree({ owner, repo: repo.name, tree });
    const { data: commit } = await gh.rest.git.createCommit({
      owner,
      repo: repo.name,
      message: req.isPartial ? "Initial commit (partial build)" : "Initial commit",
      tree: created.sha,
      parents: [],
    });
    await gh.rest.git.createRef({
      owner,
      repo: repo.name,
      ref: `refs/heads/${repo.default_branch}`,
      sha: commit.sha,
    });
    return { kind: "github", ref: repo.html_url };
  }
}
