import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SandboxError, type Sandbox, type SandboxDriver } from "./port.js";
import {
  DEFAULT_SANDBOX_IMAGE,
  LocalDockerDriver,
  resolveDocker,
} from "./local/docker-sandbox.js";

/**
 * Egress verification (Phase 3 build-plan DoD; ADR-47): a sandbox actively
 * TRIES to reach places it must not — this is the genuine test the
 * config-level `NetworkMode: "none"` claim builds toward, and the
 * parity-test select.ts requires before SANDBOX_DRIVER=e2b may be enabled.
 * The suite is driver-parameterized: when the E2B adapter is hardened, add
 * its driver to DRIVERS and the same attempts must fail there too.
 *
 * Attempts cover distinct paths so a single misconfiguration can't pass:
 * DNS resolution, direct-IP TCP (no DNS needed), and HTTP via node's fetch.
 */

async function dockerAvailable(): Promise<boolean> {
  try {
    await resolveDocker();
    return true;
  } catch {
    return false;
  }
}

const available = await dockerAvailable();
if (!available && process.env["SANDBOX_INTEGRATION"] === "1") {
  throw new Error("SANDBOX_INTEGRATION=1 but the Docker daemon is unreachable — refusing to skip");
}

const DRIVERS: { name: string; make: () => SandboxDriver }[] = [
  { name: "local-docker", make: () => new LocalDockerDriver() },
  // e2b joins here once its adapter reaches isolation parity (select.ts).
];

describe.skipIf(!available).each(DRIVERS)("sandbox egress restrictions ($name)", ({ make }) => {
  const driver = make();
  let sandbox: Sandbox;

  beforeAll(async () => {
    sandbox = await driver.create({
      image: DEFAULT_SANDBOX_IMAGE,
      timeoutMs: 5 * 60_000,
      runId: "egress-itest",
    });
  }, 180_000);

  afterAll(async () => {
    await sandbox?.dispose();
  });

  it("cannot resolve DNS", async () => {
    const result = await sandbox.runCommand(
      `node -e "require('node:dns').promises.resolve('example.com').then(() => { console.log('RESOLVED'); process.exit(0); }, () => process.exit(1))"`,
      { timeoutMs: 30_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("RESOLVED");
  });

  it("cannot open a TCP connection to a public IP (no DNS involved)", async () => {
    // 1.1.1.1:443 — reachable from any networked host; only isolation stops it.
    const result = await sandbox.runCommand(
      `node -e "const s=require('node:net').connect({host:'1.1.1.1',port:443,timeout:5000});s.on('connect',()=>{console.log('CONNECTED');process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))"`,
      { timeoutMs: 30_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("CONNECTED");
  });

  it("cannot fetch over HTTP(S)", async () => {
    const result = await sandbox.runCommand(
      `node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>{console.log('FETCHED');process.exit(0)},()=>process.exit(1))"`,
      { timeoutMs: 30_000 },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("FETCHED");
  });

  it("cannot reach the host's loopback (no container→host tunnel)", async () => {
    const result = await sandbox
      .runCommand(
        `node -e "const s=require('node:net').connect({host:'172.17.0.1',port:5433,timeout:5000});s.on('connect',()=>{console.log('CONNECTED');process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>process.exit(1))"`,
        { timeoutMs: 30_000 },
      )
      .catch((error: unknown) => {
        // A driver may surface hard isolation as a SandboxError instead of
        // an exit code — that's a pass for egress purposes.
        if (error instanceof SandboxError) return { exitCode: 1, stdout: "", stderr: "", durationMs: 0 };
        throw error;
      });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("CONNECTED");
  });
});
