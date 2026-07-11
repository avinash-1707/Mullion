import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { assertSafeArtifactPath, type ArtifactFile, type ArtifactStore } from "./port.js";

/**
 * The M4 substrate: the run's tree lives under ARTIFACT_DIR/<runId>/. Real
 * filesystem, real files — not a mock — so Reviewer/DevOps read genuine
 * produced code, same "real local substrate" honesty as LocalDockerSandbox.
 * S3 later swaps the backing store, not the semantics.
 */
export class LocalFsArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  private runDir(runId: string): string {
    // runId is a uuid from our own DB — safe as a path segment.
    return join(this.baseDir, assertSafeArtifactPath(runId));
  }

  async put(runId: string, files: ArtifactFile[]): Promise<void> {
    const base = this.runDir(runId);
    for (const file of files) {
      const safe = assertSafeArtifactPath(file.path);
      const full = join(base, safe);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, file.content, "utf8");
    }
  }

  async readTree(runId: string): Promise<ArtifactFile[]> {
    const base = this.runDir(runId);
    const paths = await this.walk(base, base);
    const out: ArtifactFile[] = [];
    for (const rel of paths) {
      const content = await readFile(join(base, rel), "utf8");
      out.push({ path: rel.split(sep).join("/"), content });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async list(runId: string): Promise<string[]> {
    const base = this.runDir(runId);
    const paths = await this.walk(base, base);
    return paths.map((p) => p.split(sep).join("/")).sort();
  }

  async sweepStale(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let entries;
    try {
      entries = await readdir(this.baseDir, { withFileTypes: true });
    } catch {
      return 0; // no artifact dir yet — nothing to sweep
    }
    let removed = 0;
    // Top-level entries are per-run trees (<runId>/) and sibling delivery
    // dirs (deliveries-<runId>/), both written by put(). A directory's mtime
    // advances when its children change, so it tracks the run's last write.
    for (const entry of entries) {
      const full = join(this.baseDir, entry.name);
      try {
        const info = await stat(full);
        if (info.mtimeMs >= cutoff) continue;
        await rm(full, { recursive: true, force: true });
        removed += 1;
      } catch {
        // A racing writer or a vanished entry must not abort the sweep.
        continue;
      }
    }
    return removed;
  }

  private async walk(dir: string, base: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return []; // no tree yet for this run
    }
    const out: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.walk(full, base)));
      } else if (entry.isFile()) {
        out.push(relative(base, full));
      }
    }
    return out;
  }
}
