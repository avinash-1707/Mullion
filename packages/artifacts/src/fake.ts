import { assertSafeArtifactPath, type ArtifactFile, type ArtifactStore } from "./port.js";

/** In-memory artifact store for unit tests (exported via @mullion/artifacts/testing). */
export class InMemoryArtifactStore implements ArtifactStore {
  readonly trees = new Map<string, Map<string, string>>();

  async put(runId: string, files: ArtifactFile[]): Promise<void> {
    const tree = this.trees.get(runId) ?? new Map<string, string>();
    for (const file of files) {
      tree.set(assertSafeArtifactPath(file.path), file.content); // last-writer-wins
    }
    this.trees.set(runId, tree);
  }

  async readTree(runId: string): Promise<ArtifactFile[]> {
    const tree = this.trees.get(runId) ?? new Map<string, string>();
    return [...tree.entries()]
      .map(([path, content]) => ({ path, content }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async list(runId: string): Promise<string[]> {
    return [...(this.trees.get(runId)?.keys() ?? [])].sort();
  }
}
