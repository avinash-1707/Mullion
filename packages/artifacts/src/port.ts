/**
 * Artifact store (ADR-53) — durable home for the repo a build produces. The
 * milestone-M4 spine: M1–M3 run each task in a sandbox that is disposed, so
 * the produced files evaporate; Reviewer and DevOps both need the cumulative
 * tree to exist somewhere. Mirrors the Sandbox port's dual-adapter shape
 * (ADR-44): a real S3 adapter that compiles but is unused (no creds), and a
 * local-fs adapter that is the actual M4 substrate.
 *
 * M4 scope: text files only (binary deferred); union-only accumulation
 * (last-writer-wins per path); no hydration back into sandboxes (Option B —
 * dependent-task builds are a fast-follow).
 */

export interface ArtifactFile {
  /** Workspace-relative path (no leading slash, no `..`). */
  path: string;
  content: string;
}

export interface ArtifactStore {
  /** Merge files into the run's tree (last-writer-wins per path). */
  put(runId: string, files: ArtifactFile[]): Promise<void>;
  /** The full accumulated tree for a run. */
  readTree(runId: string): Promise<ArtifactFile[]>;
  /** Just the paths. */
  list(runId: string): Promise<string[]>;
}

/** Reject a path that would escape the run's tree — same discipline as the sandbox port. */
export function assertSafeArtifactPath(path: string): string {
  // Normalize backslashes to '/' first, so a Windows-style `..\..\x` is
  // rejected as traversal rather than stored as one literal filename
  // (defense-in-depth — the deploy target is Linux).
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments: string[] = [];
  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      throw new Error(`unsafe artifact path (escapes tree): ${path}`);
    }
    segments.push(part);
  }
  if (segments.length === 0) throw new Error(`empty artifact path: ${path}`);
  return segments.join("/");
}
