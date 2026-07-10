import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SANDBOX_WORKDIR, SandboxError, type Sandbox } from "../port.js";
import {
  DEFAULT_SANDBOX_IMAGE,
  LocalDockerDriver,
  reapContainersForRun,
  resolveDocker,
} from "./docker-sandbox.js";

/**
 * Real-daemon integration suite. Skips (visibly) when Docker is absent —
 * UNLESS SANDBOX_INTEGRATION=1, which makes a missing daemon a hard failure
 * so a claimed-Docker environment can't silently pass.
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

describe.skipIf(!available)("LocalDockerSandbox (integration)", () => {
  const driver = new LocalDockerDriver();
  let sandbox: Sandbox;

  beforeAll(async () => {
    sandbox = await driver.create({
      image: DEFAULT_SANDBOX_IMAGE,
      timeoutMs: 5 * 60_000,
      runId: "itest-run",
    });
  }, 180_000); // first run may pull the image

  afterAll(async () => {
    await sandbox?.dispose();
  });

  it("writes and reads files under the workdir", async () => {
    await sandbox.writeFile("src/hello.txt", "hello sandbox");
    expect(await sandbox.readFile("src/hello.txt")).toBe("hello sandbox");
  });

  it("returns real exit codes and stderr without throwing", async () => {
    const ok = await sandbox.runCommand("echo out && echo err >&2", { timeoutMs: 10_000 });
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.trim()).toBe("out");
    expect(ok.stderr.trim()).toBe("err");

    const fail = await sandbox.runCommand("exit 3", { timeoutMs: 10_000 });
    expect(fail.exitCode).toBe(3);
  });

  it("runs real node inside the container", async () => {
    await sandbox.writeFile("app.js", "console.log(6 * 7)");
    const result = await sandbox.runCommand("node app.js", { timeoutMs: 30_000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("42");
  });

  it("times out a hung command as a SandboxError", async () => {
    await expect(sandbox.runCommand("sleep 60", { timeoutMs: 2_000 })).rejects.toMatchObject({
      kind: "timeout",
    });
  }, 30_000);

  it("blocks network egress (ADR-47 hermetic sandbox)", async () => {
    const result = await sandbox.runCommand(
      "node -e \"fetch('https://example.com').then(()=>process.exit(0),()=>process.exit(7))\"",
      { timeoutMs: 30_000 },
    );
    expect(result.exitCode).toBe(7);
  }, 45_000);

  it("rejects path escapes", async () => {
    await expect(sandbox.writeFile("../evil.txt", "x")).rejects.toMatchObject({
      kind: "protocol",
    });
  });

  it("enforces read-only rootfs outside workdir/tmp", async () => {
    const result = await sandbox.runCommand("touch /usr/bin/evil", { timeoutMs: 10_000 });
    expect(result.exitCode).not.toBe(0);
  });

  it("dispose removes the container and is idempotent; reaper finds nothing after", async () => {
    const extra = await driver.create({ timeoutMs: 60_000, runId: "itest-reap" });
    await extra.dispose();
    await extra.dispose();
    // Container is gone (AutoRemove or explicit) — exec now fails as container_died.
    await expect(extra.runCommand("true", { timeoutMs: 5_000 })).rejects.toBeInstanceOf(
      SandboxError,
    );
    expect(await reapContainersForRun("itest-reap")).toBe(0);
  }, 120_000);

  it(`workdir is ${SANDBOX_WORKDIR} and exec-capable`, async () => {
    await sandbox.writeFile("run.sh", "#!/bin/sh\necho from-script");
    const chmod = await sandbox.runCommand("chmod +x run.sh && ./run.sh", { timeoutMs: 10_000 });
    expect(chmod.exitCode).toBe(0);
    expect(chmod.stdout.trim()).toBe("from-script");
  });
});
