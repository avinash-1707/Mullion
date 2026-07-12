import { NativeConnection } from "@temporalio/worker";
import { childLogger, getLogger, initLogger, type Logger } from "@mullion/logger";
import { createWorkerOtelParts, startOtel } from "@mullion/otel";
import { OpenRouterClient } from "@mullion/llm";
import { createSandboxDriver, reapStaleContainers } from "@mullion/sandbox";
import { createArtifactStore } from "@mullion/artifacts";
import {
  ArchiveDeliveryTarget,
  FakeGitHubDeliveryTarget,
  GitHubDeliveryTarget,
  type DeliveryTarget,
} from "@mullion/delivery";
import { createBuildWorker } from "@mullion/orchestrator";
import { db } from "./lib/db.js";
import { env } from "./config/env.js";
import { getGitHubAccessToken } from "./modules/github/token.js";
import { byokApiKeyResolver, disableByokKeyOnAuthFailure } from "./modules/settings/byok.js";
import { llmFetchImpl } from "./lib/llm-fetch.js";
import { publishStreamEvent } from "./lib/sse.js";

/**
 * Build worker process (ADR-50). Separate process from the API, same
 * deployable (02 §7.1). Run with `pnpm --filter @mullion/api worker`
 * alongside a local `temporal server start-dev`.
 */
// A sandbox container older than this, still labeled, is an orphan from a
// crashed/killed worker (its `sleep infinity` never triggers AutoRemove).
const STALE_CONTAINER_MS = 60 * 60_000; // 1h — well past the per-task TTL
const SWEEP_INTERVAL_MS = 15 * 60_000;

async function main(): Promise<void> {
  // Logger first (ADR-63), then OTel — startOtel registers the context
  // manager the trace_id mixin reads.
  const log: Logger = initLogger({
    service: "mullion-build-worker",
    level: env.LOG_LEVEL,
    pretty: env.LOG_FORMAT === "pretty",
  });
  // Activity/Node spans go through the NodeSDK; workflow-sandbox spans exit
  // via the exporter sink below. Both no-op without an OTLP endpoint (02 §9).
  await startOtel({ serviceName: "mullion-build-worker" });
  const otel = await createWorkerOtelParts({ serviceName: "mullion-build-worker" });

  // Global orphan sweep at boot + periodically (Phase-2 gate): the per-run
  // reaper only fires on a retry of the same run, so a SIGKILLed or
  // abandoned run would otherwise leak its container forever.
  if (env.SANDBOX_DRIVER === "local") {
    const sweep = (): void => {
      void reapStaleContainers(STALE_CONTAINER_MS).then((n) => {
        if (n > 0) log.info({ count: n }, "swept stale sandbox containers");
      });
    };
    sweep();
    setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();
  }

  const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });

  const llm = new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    db,
    referer: env.API_ORIGIN,
    // ADR-70: same BYOK wiring as the API process — builds spend the org's
    // key when one is enabled, and a dead key degrades to platform, never
    // a hard build failure.
    apiKeyResolver: byokApiKeyResolver(db),
    onByokAuthFailure: disableByokKeyOnAuthFailure(db),
    ...(env.NODE_ENV !== "production" && env.OPENROUTER_BASE_URL
      ? { baseUrl: env.OPENROUTER_BASE_URL }
      : {}),
    ...(llmFetchImpl ? { fetchImpl: llmFetchImpl } : {}),
  });
  const driver = createSandboxDriver({
    driver: env.SANDBOX_DRIVER,
    e2bApiKey: env.E2B_API_KEY,
  });

  const artifactStore = createArtifactStore({
    store: env.ARTIFACT_STORE,
    localDir: env.ARTIFACT_DIR,
    ...(env.ARTIFACT_S3_BUCKET !== undefined ? { s3Bucket: env.ARTIFACT_S3_BUCKET } : {}),
  });

  // Retention sweep at boot + on the same timer as the container reaper: run
  // trees and their delivery blobs accrue on disk forever otherwise (Phase 3
  // audit). S3 no-ops (its retention is a bucket lifecycle rule).
  const sweepArtifacts = (): void => {
    void artifactStore.sweepStale(env.ARTIFACT_RETENTION_MS).then((n) => {
      if (n > 0) log.info({ count: n }, "swept stale artifact trees");
    });
  };
  sweepArtifacts();
  setInterval(sweepArtifacts, SWEEP_INTERVAL_MS).unref?.();

  // Archive always; GitHub push per config (real Octokit, or the local fake
  // when no OAuth app is configured — ADR-54/56).
  const archiveTarget = new ArchiveDeliveryTarget(artifactStore, async (runId, name, zip) => {
    // Store the zip under a SIBLING key, not `${runId}/…`, so readTree(runId)
    // (used by review + ship to read the repo) never re-includes the delivery
    // artifact — otherwise a ship retry would zip-in-zip / commit the blob.
    await artifactStore.put(`deliveries-${runId}`, [{ path: name, content: zip.toString("base64") }]);
    return `artifact://deliveries-${runId}/${name}`;
  });
  const githubTarget: DeliveryTarget =
    env.GITHUB_DELIVERY === "github"
      ? new GitHubDeliveryTarget(getGitHubAccessToken)
      : new FakeGitHubDeliveryTarget();
  const deliveryTargets: DeliveryTarget[] = [archiveTarget, githubTarget];

  const worker = await createBuildWorker({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    ...(otel ? { otel } : {}),
    deps: {
      db,
      llm,
      log: childLogger({ module: "orchestrator" }),
      driver,
      sandboxCostPerSec: env.SANDBOX_COST_USD_PER_SEC,
      image: env.SANDBOX_IMAGE,
      budget: { runBudgetUsd: env.RUN_BUDGET_USD, orgBudgetUsd: env.ORG_DAILY_LLM_BUDGET_USD },
      artifactStore,
      reviewLlm: llm,
      deliveryTargets,
      publishEvent: (dbArg, args) => publishStreamEvent(dbArg, args),
    },
  });

  log.info({ address: env.TEMPORAL_ADDRESS }, "build worker connected to Temporal");
  await worker.run();
}

main().catch((error: unknown) => {
  // getLogger(): main() may have died before initLogger() ran.
  getLogger().fatal({ err: error }, "build worker crashed");
  getLogger().flush();
  process.exitCode = 1;
});
