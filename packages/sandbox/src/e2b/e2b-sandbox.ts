import { CommandExitError, Sandbox as E2bSdkSandbox, TimeoutError } from "e2b";
import {
  SANDBOX_WORKDIR,
  SandboxError,
  resolveWorkdirPath,
  type CommandResult,
  type CreateSandboxOptions,
  type RunCommandOptions,
  type Sandbox,
  type SandboxDriver,
} from "../port.js";

/**
 * The subset of the e2b SDK the adapter actually touches — a seam so the
 * conversion logic (the whole point of the adapter) is unit-testable with a
 * fake, since no E2B key exists to run the real SDK.
 */
export interface E2bSdkLike {
  readonly sandboxId: string;
  files: { write(path: string, content: string): Promise<unknown>; read(path: string): Promise<unknown> };
  commands: {
    run(
      cmd: string,
      opts: { cwd?: string; timeoutMs?: number; envs?: Record<string, string> },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  kill(): Promise<unknown>;
}

/**
 * E2B adapter (ADR-44). Compiles against the real `e2b` SDK so the binding
 * is proven at the type level; it cannot run without an E2B_API_KEY, which
 * doesn't exist in this environment yet — live verification is deferred to
 * the moment a key does (tests skipIf(!process.env.E2B_API_KEY)).
 *
 * Critical semantic translation: the SDK throws CommandExitError on any
 * non-zero exit; the port says a command that ran returns a CommandResult.
 * This adapter converts — both drivers must present identical semantics.
 */
export class E2bSandbox implements Sandbox {
  readonly id: string;
  private readonly sdk: E2bSdkLike;
  private disposed = false;

  /** Exposed (not `private`) so tests can wrap a fake SDK — see e2b-sandbox.test.ts. */
  constructor(sdk: E2bSdkLike) {
    this.sdk = sdk;
    this.id = sdk.sandboxId;
  }

  static async create(apiKey: string, opts: CreateSandboxOptions): Promise<E2bSandbox> {
    let sdk: E2bSdkSandbox;
    try {
      sdk = await E2bSdkSandbox.create({
        apiKey,
        timeoutMs: opts.timeoutMs,
        ...(opts.envs !== undefined ? { envs: opts.envs } : {}),
        ...(opts.runId !== undefined ? { metadata: { "mullion.run_id": opts.runId } } : {}),
      });
    } catch (error) {
      throw new SandboxError({
        kind: "driver_unavailable",
        message: "E2B sandbox creation failed",
        retryable: true,
        cause: error,
      });
    }
    const sandbox = new E2bSandbox(sdk as unknown as E2bSdkLike);
    // The default E2B template roots at /home/user; /workspace won't exist
    // unless we create it, so the port's workdir contract holds after a swap.
    try {
      await sdk.commands.run(`mkdir -p ${SANDBOX_WORKDIR}`, { timeoutMs: 30_000 });
    } catch (error) {
      throw new SandboxError({
        kind: "driver_unavailable",
        message: `E2B sandbox could not create ${SANDBOX_WORKDIR}`,
        retryable: true,
        cause: error,
      });
    }
    return sandbox;
  }

  async writeFile(path: string, content: string): Promise<void> {
    try {
      await this.sdk.files.write(resolveWorkdirPath(path), content);
    } catch (error) {
      // Symmetry with the local driver: a write failure is signal fed back to
      // the model, never a raw throw that escapes the loop.
      if (error instanceof SandboxError) throw error;
      throw new SandboxError({
        kind: "protocol",
        message: `writeFile failed for ${path}`,
        retryable: false,
        cause: error,
      });
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      return String(await this.sdk.files.read(resolveWorkdirPath(path)));
    } catch (error) {
      throw new SandboxError({
        kind: "not_found",
        message: `readFile failed for ${path}`,
        retryable: false,
        cause: error,
      });
    }
  }

  async runCommand(cmd: string, opts: RunCommandOptions): Promise<CommandResult> {
    const started = Date.now();
    try {
      const result = await this.sdk.commands.run(cmd, {
        cwd: opts.cwd !== undefined ? resolveWorkdirPath(opts.cwd) : SANDBOX_WORKDIR,
        timeoutMs: opts.timeoutMs,
        ...(opts.env !== undefined ? { envs: opts.env } : {}),
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof CommandExitError) {
        // Ran to completion with a non-zero exit — signal, not an error.
        return {
          stdout: error.stdout,
          stderr: error.stderr,
          exitCode: error.exitCode,
          durationMs: Date.now() - started,
        };
      }
      if (error instanceof TimeoutError) {
        throw new SandboxError({
          kind: "timeout",
          message: `command exceeded ${opts.timeoutMs}ms: ${cmd.slice(0, 200)}`,
          retryable: false,
          cause: error,
        });
      }
      throw new SandboxError({
        kind: "container_died",
        message: "E2B command failed mid-flight",
        retryable: true,
        cause: error,
      });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.sdk.kill().catch(() => undefined);
  }
}

export class E2bDriver implements SandboxDriver {
  readonly name = "e2b" as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      // Boot-time guard (fail loud at construction, never mid-run).
      throw new Error("E2bDriver requires an E2B_API_KEY — refusing to construct without one");
    }
    this.apiKey = apiKey;
  }

  create(opts: CreateSandboxOptions): Promise<Sandbox> {
    return E2bSandbox.create(this.apiKey, opts);
  }
}
