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
      // Phase-2 security gate: the E2bSandbox adapter proves the PORT binding
      // but does NOT yet set E2B's network/resource isolation to parity with
      // the hardened local driver (ADR-47). E2B sandboxes default to internet
      // ON, so selecting e2b as-is would silently void the "no network"
      // guarantee the Coder prompt relies on. Refuse until the adapter sets
      // isolation to parity AND an egress parity-test exists — swap stays a
      // config change once that lands. (No E2B key exists in v1 anyway.)
      throw new Error(
        "SANDBOX_DRIVER=e2b is not enabled: the E2B adapter's network/resource isolation is not yet at parity with the local driver (ADR-47). Use SANDBOX_DRIVER=local until hardening + an egress parity-test land.",
      );
    }
  }
}
