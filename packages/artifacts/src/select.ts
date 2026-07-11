import { LocalFsArtifactStore } from "./local-fs.js";
import { S3ArtifactStore } from "./s3.js";
import type { ArtifactStore } from "./port.js";

export interface ArtifactStoreConfig {
  store: "local" | "s3";
  localDir?: string | undefined;
  s3Bucket?: string | undefined;
  s3Prefix?: string | undefined;
}

/** Select the artifact store (ADR-53). s3 without a bucket fails at boot, never mid-run. */
export function createArtifactStore(config: ArtifactStoreConfig): ArtifactStore {
  switch (config.store) {
    case "local":
      return new LocalFsArtifactStore(config.localDir ?? "./.artifacts");
    case "s3": {
      if (!config.s3Bucket) {
        throw new Error("ARTIFACT_STORE=s3 requires ARTIFACT_S3_BUCKET — set it or use ARTIFACT_STORE=local");
      }
      return new S3ArtifactStore({
        bucket: config.s3Bucket,
        ...(config.s3Prefix !== undefined ? { prefix: config.s3Prefix } : {}),
      });
    }
  }
}
