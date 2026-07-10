import { CommandExitError, TimeoutError } from "e2b";
import { describe, expect, it, vi } from "vitest";
import { SandboxError } from "../port.js";
import { E2bSandbox, type E2bSdkLike } from "./e2b-sandbox.js";

/**
 * The whole point of the E2B adapter is the semantic translation to the
 * port (ADR-44 "both drivers present identical semantics"). No key exists to
 * run the real SDK, so the conversion is proven against a fake SDK here.
 */

function fakeSdk(overrides: Partial<E2bSdkLike>): E2bSdkLike {
  return {
    sandboxId: "sbx-1",
    files: { write: vi.fn().mockResolvedValue(undefined), read: vi.fn().mockResolvedValue("") },
    commands: { run: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }) },
    kill: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("E2bSandbox conversion", () => {
  it("returns a non-zero exit as a CommandResult (CommandExitError → result, not throw)", async () => {
    const sdk = fakeSdk({
      commands: {
        run: vi.fn().mockRejectedValue(
          new CommandExitError({ stdout: "out", stderr: "boom", exitCode: 2, error: "", index: 0 } as never),
        ),
      },
    });
    const sandbox = new E2bSandbox(sdk);
    const result = await sandbox.runCommand("false", { timeoutMs: 1000 });
    expect(result).toMatchObject({ stdout: "out", stderr: "boom", exitCode: 2 });
  });

  it("maps TimeoutError to SandboxError(timeout)", async () => {
    const sdk = fakeSdk({
      commands: { run: vi.fn().mockRejectedValue(new TimeoutError("timed out")) },
    });
    const sandbox = new E2bSandbox(sdk);
    await expect(sandbox.runCommand("sleep 9", { timeoutMs: 1000 })).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("maps an arbitrary command rejection to container_died", async () => {
    const sdk = fakeSdk({
      commands: { run: vi.fn().mockRejectedValue(new Error("connection reset")) },
    });
    const sandbox = new E2bSandbox(sdk);
    await expect(sandbox.runCommand("x", { timeoutMs: 1000 })).rejects.toMatchObject({
      kind: "container_died",
    });
  });

  it("maps a readFile failure to not_found (never a raw throw)", async () => {
    const sdk = fakeSdk({
      files: {
        write: vi.fn(),
        read: vi.fn().mockRejectedValue(new Error("ENOENT")),
      },
    });
    const sandbox = new E2bSandbox(sdk);
    await expect(sandbox.readFile("missing.txt")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("wraps a writeFile failure as a SandboxError, symmetric with the local driver", async () => {
    const sdk = fakeSdk({
      files: {
        write: vi.fn().mockRejectedValue(new Error("disk full")),
        read: vi.fn(),
      },
    });
    const sandbox = new E2bSandbox(sdk);
    const rejection = await sandbox.writeFile("a.ts", "x").catch((e) => e);
    expect(rejection).toBeInstanceOf(SandboxError);
    expect(rejection.kind).toBe("protocol");
  });

  it("resolves paths under the workdir before handing them to the SDK", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const sandbox = new E2bSandbox(fakeSdk({ files: { write, read: vi.fn() } }));
    await sandbox.writeFile("src/a.ts", "x");
    expect(write).toHaveBeenCalledWith("/workspace/src/a.ts", "x");
  });

  it("dispose is idempotent and calls kill once", async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    const sandbox = new E2bSandbox(fakeSdk({ kill }));
    await sandbox.dispose();
    await sandbox.dispose();
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
