import { NativeConnection } from "@temporalio/worker";
import { OpenRouterClient } from "@mullion/llm";
import { createSandboxDriver } from "@mullion/sandbox";
import { createBuildWorker } from "@mullion/orchestrator";
import { db } from "./db.js";
import { env } from "./env.js";
import { publishStreamEvent } from "./sse.js";

/**
 * Build worker process (ADR-50). Separate process from the API, same
 * deployable (02 §7.1). Run with `pnpm --filter @mullion/api worker`
 * alongside a local `temporal server start-dev`.
 */
async function main(): Promise<void> {
  const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });

  const llm = new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    db,
    referer: env.API_ORIGIN,
    ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}),
  });
  const driver = createSandboxDriver({
    driver: env.SANDBOX_DRIVER,
    e2bApiKey: env.E2B_API_KEY,
  });

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
