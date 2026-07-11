import { assertSafeArtifactPath, type ArtifactFile, type ArtifactStore } from "./port.js";

/**
 * S3 artifact store (ADR-53, spec §4.3). Deferred like E2bSandbox: no S3
 * creds exist yet, so this is a structural placeholder that documents the
 * real surface and fails loudly if selected without configuration. Wire in
 * the AWS SDK when creds arrive — the port contract above stays identical,
 * so the swap is config-only.
 */
export interface S3ArtifactConfig {
  bucket: string;
  prefix?: string;
  // region/credentials come from the AWS SDK's standard env/instance chain.
}

export class S3ArtifactStore implements ArtifactStore {
  constructor(private readonly config: S3ArtifactConfig) {
    if (!config.bucket) {
      throw new Error("S3ArtifactStore requires a bucket — set ARTIFACT_S3_BUCKET or use ARTIFACT_STORE=local");
    }
  }

  private key(runId: string, path: string): string {
    return [this.config.prefix, runId, assertSafeArtifactPath(path)].filter(Boolean).join("/");
  }

  async put(_runId: string, _files: ArtifactFile[]): Promise<void> {
    throw new Error("S3ArtifactStore is not wired yet (no AWS creds in v1) — use ARTIFACT_STORE=local");
  }

  async readTree(_runId: string): Promise<ArtifactFile[]> {
    throw new Error("S3ArtifactStore is not wired yet (no AWS creds in v1) — use ARTIFACT_STORE=local");
  }

  async list(_runId: string): Promise<string[]> {
    throw new Error("S3ArtifactStore is not wired yet (no AWS creds in v1) — use ARTIFACT_STORE=local");
  }
}
