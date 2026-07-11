import { NativeConnection } from "@temporalio/worker";
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
import { db } from "./db.js";
import { env } from "./env.js";
import { getGitHubAccessToken } from "./github/token.js";
import { llmFetchImpl } from "./llm-fetch.js";
import { publishStreamEvent } from "./sse.js";

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
  // Global orphan sweep at boot + periodically (Phase-2 gate): the per-run
  // reaper only fires on a retry of the same run, so a SIGKILLed or
  // abandoned run would otherwise leak its container forever.
  if (env.SANDBOX_DRIVER === "local") {
    const sweep = (): void => {
      void reapStaleContainers(STALE_CONTAINER_MS).then((n) => {
        if (n > 0) console.log(`swept ${n} stale sandbox container(s)`);
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
    deps: {
      db,
      llm,
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

  console.log(`build worker connected to Temporal at ${env.TEMPORAL_ADDRESS}`);
  await worker.run();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
