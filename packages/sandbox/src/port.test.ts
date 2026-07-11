import { describe, expect, it } from "vitest";
import { SANDBOX_WORKDIR, SandboxError, resolveWorkdirPath } from "./port.js";
import { FakeSandbox } from "./testing/fake-sandbox.js";
import { createSandboxDriver } from "./select.js";

describe("resolveWorkdirPath", () => {
  it("resolves relative paths under the workdir", () => {
    expect(resolveWorkdirPath("src/index.ts")).toBe(`${SANDBOX_WORKDIR}/src/index.ts`);
    expect(resolveWorkdirPath("./a/./b.txt")).toBe(`${SANDBOX_WORKDIR}/a/b.txt`);
  });

  it("accepts absolute paths inside the workdir", () => {
    expect(resolveWorkdirPath(`${SANDBOX_WORKDIR}/a.txt`)).toBe(`${SANDBOX_WORKDIR}/a.txt`);
  });

  it("collapses .. within the workdir", () => {
    expect(resolveWorkdirPath("a/../b.txt")).toBe(`${SANDBOX_WORKDIR}/b.txt`);
  });

  it("rejects escapes", () => {
    for (const path of ["../etc/passwd", "/etc/passwd", "a/../../etc", `${SANDBOX_WORKDIR}/../root`]) {
      expect(() => resolveWorkdirPath(path), path).toThrowError(SandboxError);
      try {
        resolveWorkdirPath(path);
      } catch (error) {
        expect((error as SandboxError).kind).toBe("protocol");
      }
    }
  });
});

describe("FakeSandbox port contract", () => {
  it("non-zero exit is a CommandResult, never a throw", async () => {
    const sandbox = new FakeSandbox(() => ({ stdout: "", stderr: "boom", exitCode: 1, durationMs: 2 }));
    const result = await sandbox.runCommand("false", { timeoutMs: 1000 });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("boom");
  });

  it("readFile of a missing path throws not_found", async () => {
    const sandbox = new FakeSandbox();
    await expect(sandbox.readFile("missing.txt")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("write/read round-trips through path resolution", async () => {
    const sandbox = new FakeSandbox();
    await sandbox.writeFile("dir/file.txt", "hello");
    expect(await sandbox.readFile(`${SANDBOX_WORKDIR}/dir/file.txt`)).toBe("hello");
  });

  it("dispose is idempotent", async () => {
    const sandbox = new FakeSandbox();
    await sandbox.dispose();
    await sandbox.dispose();
    expect(sandbox.disposed).toBe(true);
  });
});

describe("createSandboxDriver", () => {
  it("selects the local driver", () => {
    expect(createSandboxDriver({ driver: "local" }).name).toBe("local");
  });

  it("refuses e2b without a key at construction time", () => {
    expect(() => createSandboxDriver({ driver: "e2b" })).toThrowError(/E2B_API_KEY/);
  });

  it("refuses e2b even with a key until hardening parity (Phase-2 gate)", () => {
    expect(() => createSandboxDriver({ driver: "e2b", e2bApiKey: "e2b_test" })).toThrowError(
      /not yet at parity/,
    );
  });
});
