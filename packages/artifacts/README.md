# @mullion/artifacts

> Durable store for the file tree a build produces (ADR-53).

Each build task runs in a throwaway sandbox. This package accumulates the combined repo across tasks (a union, last writer wins per path), so the Reviewer and DevOps agents can read the real produced files after the sandbox is gone.

## High-level idea

A small ports-and-adapters package: one `ArtifactStore` interface, three implementations, one factory. Swapping local filesystem for S3 is a config change, not a code change. Every write path goes through `assertSafeArtifactPath`, mirroring the sandbox's path-escape guard.

## Layout

| File | What |
|---|---|
| `src/port.ts` | The `ArtifactStore` interface (`put`, `readTree`, `list`, `sweepStale`), `ArtifactFile`, `assertSafeArtifactPath` |
| `src/local-fs.ts` | `LocalFsArtifactStore`: the real substrate. Writes each run's tree under `baseDir/<runId>/` |
| `src/s3.ts` | `S3ArtifactStore`: a structural placeholder (ADR-53). It documents the real surface for a config-only swap and throws without AWS creds. `sweepStale` is a deliberate no-op, since a bucket lifecycle policy handles retention |
| `src/fake.ts` | `InMemoryArtifactStore` for tests. Exposes `trees` and `writtenAt` for assertions and backdating |
| `src/select.ts` | `createArtifactStore(config)`: picks local or s3. S3 without a bucket fails at boot |

## Exports

- `.`: the interface, all stores, `createArtifactStore`, `assertSafeArtifactPath`
- `./testing`: `InMemoryArtifactStore`

## Configuration

Passed in as `ArtifactStoreConfig` (no direct env reads). The API maps these env vars into it: `ARTIFACT_STORE` (`local` or `s3`), `ARTIFACT_DIR` (default `./.artifacts`), `ARTIFACT_S3_BUCKET`, `ARTIFACT_RETENTION_MS` (sweep TTL, default 7 days).

## Where it fits

Consumed by `apps/api`, `@mullion/orchestrator`, and `@mullion/delivery` (which zips or pushes trees read from here). No workspace dependencies of its own.

## Testing

`src/artifacts.test.ts` (vitest): the path guard, the in-memory store, local-fs against a real tmpdir, the S3 placeholder, and the selector. `pnpm test`.
