import {
  SandboxError,
  resolveWorkdirPath,
  type CommandResult,
  type RunCommandOptions,
  type Sandbox,
} from "../port.js";

/**
 * In-memory Sandbox for unit tests (exported via `@mullion/sandbox/testing`).
 * Commands resolve through a caller-supplied handler so tests can script
 * exit codes, hangs, and deaths without Docker.
 */
export class FakeSandbox implements Sandbox {
  readonly id = "fake-sandbox";
  readonly files = new Map<string, string>();
  readonly commands: string[] = [];
  disposed = false;

  private readonly handler: (cmd: string, opts: RunCommandOptions) => CommandResult | Promise<CommandResult>;

  constructor(
    handler?: (cmd: string, opts: RunCommandOptions) => CommandResult | Promise<CommandResult>,
  ) {
    this.handler =
      handler ?? (() => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 1 }));
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(resolveWorkdirPath(path), content);
  }

  async readFile(path: string): Promise<string> {
    const resolved = resolveWorkdirPath(path);
    const content = this.files.get(resolved);
    if (content === undefined) {
      throw new SandboxError({
        kind: "not_found",
        message: `no such file: ${resolved}`,
        retryable: false,
      });
    }
    return content;
  }

  async runCommand(cmd: string, opts: RunCommandOptions): Promise<CommandResult> {
    this.commands.push(cmd);
    return this.handler(cmd, opts);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}
