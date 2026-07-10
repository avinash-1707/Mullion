import { E2bDriver } from "./e2b/e2b-sandbox.js";
import { LocalDockerDriver } from "./local/docker-sandbox.js";
import type { SandboxDriver } from "./port.js";

export interface SandboxDriverConfig {
  driver: "local" | "e2b";
  e2bApiKey?: string | undefined;
}

/**
 * Driver selection (ADR-44): swap = config change. The e2b branch fails at
 * construction when no key is present — a misconfigured deploy dies at
 * boot, never mid-run with a half-built task.
 */
export function createSandboxDriver(config: SandboxDriverConfig): SandboxDriver {
  switch (config.driver) {
    case "local":
      return new LocalDockerDriver();
    case "e2b": {
      if (!config.e2bApiKey) {
        throw new Error(
          "SANDBOX_DRIVER=e2b requires E2B_API_KEY — set it or use SANDBOX_DRIVER=local",
        );
      }
      return new E2bDriver(config.e2bApiKey);
    }
  }
}
