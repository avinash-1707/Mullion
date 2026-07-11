import type { ArtifactFile } from "@mullion/artifacts";
import { deliverySummaryFile, type DeliveryRequest, type DeliveryResult, type DeliveryTarget } from "./port.js";

/**
 * Local fakes (no creds). FakeGitHubDeliveryTarget writes the pushed tree to
 * an in-memory "remote" so an end-to-end delivery test can assert the exact
 * files that would have been pushed — the honest local substrate for the
 * GitHub path, swappable for the real target by config (ADR-44/54).
 */
export class FakeGitHubDeliveryTarget implements DeliveryTarget {
  readonly kind = "github" as const;
  readonly remotes = new Map<string, ArtifactFile[]>();

  constructor(private readonly connectedUsers: Set<string> = new Set()) {}

  connect(userId: string): void {
    this.connectedUsers.add(userId);
  }

  async available(userId: string): Promise<boolean> {
    return this.connectedUsers.has(userId);
  }

  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!this.connectedUsers.has(req.userId)) {
      throw new Error("no linked GitHub token for user — cannot push");
    }
    this.remotes.set(req.repoName, [...req.repo, deliverySummaryFile(req)]);
    return { kind: "github", ref: `fake://github/${req.repoName}` };
  }
}

/** Captures archive deliveries in memory for assertions. */
export class FakeArchiveDeliveryTarget implements DeliveryTarget {
  readonly kind = "archive" as const;
  readonly archives = new Map<string, ArtifactFile[]>();

  async available(): Promise<boolean> {
    return true;
  }

  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    this.archives.set(req.repoName, [...req.repo, deliverySummaryFile(req)]);
    return { kind: "archive", ref: `fake://archive/${req.repoName}.zip` };
  }
}
