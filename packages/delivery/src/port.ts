import type { ArtifactFile } from "@mullion/artifacts";

/**
 * Delivery targets (ADR-54, spec §11). Packaging + push only — no live
 * deploy (ADR-04/15). Two targets, offered IDENTICALLY for full and
 * partial/abandoned builds (ADR-33): an archive (always available) and a
 * GitHub repo push (available iff the user linked a token). Mirrors the
 * Sandbox/ArtifactStore port discipline: a real GitHub impl + a local fake.
 */

export interface DeliveryRequest {
  runId: string;
  organizationId: string;
  userId: string;
  repo: ArtifactFile[];
  repoName: string;
  /** ADR-33: true when the build ended failed/abandoned — delivered anyway. */
  isPartial: boolean;
  /** Human "what's built / what's missing" summary, embedded in the delivery. */
  summary: string;
}

export interface DeliveryResult {
  kind: "archive" | "github";
  /** Archive path/ref, or the repo URL. */
  ref: string;
}

export interface DeliveryTarget {
  readonly kind: "archive" | "github";
  /** Can this target run for this user right now (e.g. GitHub token linked)? */
  available(userId: string): Promise<boolean>;
  deliver(req: DeliveryRequest): Promise<DeliveryResult>;
}

/** The README/summary file embedded in every delivery so the state is self-describing. */
export function deliverySummaryFile(req: DeliveryRequest): ArtifactFile {
  const status = req.isPartial ? "PARTIAL / INCOMPLETE BUILD" : "Complete build";
  return {
    path: "MULLION_BUILD.md",
    content: `# ${req.repoName}\n\n**${status}**\n\n${req.summary}\n`,
  };
}
