import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { Writable } from "node:stream";
import Docker from "dockerode";
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
 * M1's real sandbox (ADR-44/47): a hardened local Docker container. This is
 * deliberately not a mock — real filesystem, real exit codes, real
 * stdout/stderr — so the loop-plumbing risk is genuinely retired even
 * though the kernel-isolation boundary (E2B) waits for real creds.
 *
 * Hardening set (industry consensus for untrusted generated code):
 * no network, read-only rootfs, tmpfs /tmp (noexec) + /workspace (exec
 * allowed — node_modules/.bin must run), cap-drop ALL, no-new-privileges,
 * pids/memory/cpu limits, non-root user, auto-remove.
 */

export const DEFAULT_SANDBOX_IMAGE = "node:22-bookworm-slim";

// Caps on captured output — the tool loop truncates further downstream, this
// only bounds memory against a runaway process (Phase-1 payload discipline).
const MAX_CAPTURE_BYTES = 512 * 1024;
// JS-side backstop slack over the in-container `timeout` wrapper.
const TIMEOUT_BACKSTOP_MS = 10_000;

const RUN_ID_LABEL = "mullion.run_id";

interface DockerodeLike {
  ping(): Promise<unknown>;
  createContainer(opts: Docker.ContainerCreateOptions): Promise<Docker.Container>;
  pull(image: string): Promise<NodeJS.ReadableStream>;
  modem: {
    demuxStream(stream: NodeJS.ReadableStream, out: NodeJS.WritableStream, err: NodeJS.WritableStream): void;
    followProgress(stream: NodeJS.ReadableStream, onFinished: (err: Error | null) => void): void;
  };
}

function capCollector(chunks: Buffer[], counter: { bytes: number }): NodeJS.WritableStream {
  return new Writable({
    write(chunk: Buffer, _enc, cb) {
      if (counter.bytes < MAX_CAPTURE_BYTES) {
        const room = MAX_CAPTURE_BYTES - counter.bytes;
        chunks.push(chunk.subarray(0, room));
        counter.bytes += Math.min(chunk.length, room);
      }
      cb();
    },
  });
}

function isStatusCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === code
  );
}

export class LocalDockerSandbox implements Sandbox {
  readonly id: string;
  private readonly container: Docker.Container;
  private readonly docker: DockerodeLike;
  private ttlTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  private constructor(docker: DockerodeLike, container: Docker.Container, id: string) {
    this.docker = docker;
    this.container = container;
    this.id = id;
  }

  static async create(docker: DockerodeLike, opts: CreateSandboxOptions): Promise<LocalDockerSandbox> {
    try {
      await docker.ping();
    } catch (error) {
      throw new SandboxError({
        kind: "driver_unavailable",
        message: "Docker daemon unreachable — is Docker running?",
        retryable: true,
        cause: error,
      });
    }

    const image = opts.image ?? DEFAULT_SANDBOX_IMAGE;
    const createOptions: Docker.ContainerCreateOptions = {
      Image: image,
      // Keep the container alive; every command is a separate exec.
      Cmd: ["sleep", "infinity"],
      WorkingDir: SANDBOX_WORKDIR,
      User: "1000:1000",
      Env: Object.entries(opts.envs ?? {}).map(([k, v]) => `${k}=${v}`),
      Labels: opts.runId ? { [RUN_ID_LABEL]: opts.runId } : {},
      HostConfig: {
        NetworkMode: "none", // ADR-47: hermetic — no egress, deps baked into the image
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        PidsLimit: 256,
        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024, // = Memory → no swap
        NanoCpus: 1_000_000_000, // 1 CPU
        AutoRemove: true,
        Tmpfs: {
          // noexec on /tmp; /workspace must allow exec (node_modules/.bin) —
          // and Docker injects noexec into tmpfs unless `exec` is explicit.
          "/tmp": "rw,noexec,nosuid,nodev,size=64m,mode=1777",
          [SANDBOX_WORKDIR]: "rw,exec,nosuid,nodev,size=512m,mode=1777",
        },
      },
    };

    let container: Docker.Container;
    try {
      container = await docker.createContainer(createOptions);
    } catch (error) {
      if (!isStatusCode(error, 404)) {
        throw new SandboxError({
          kind: "driver_unavailable",
          message: `Docker container create failed for image "${image}"`,
          retryable: true,
          cause: error,
        });
      }
      // Image absent locally — pull once, then retry the create.
      await new Promise<void>((resolve, reject) => {
        docker
          .pull(image)
          .then((stream) =>
            docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve())),
          )
          .catch(reject);
      }).catch((cause) => {
        throw new SandboxError({
          kind: "driver_unavailable",
          message: `Docker image pull failed for "${image}" — bake/pull it manually (sandbox has no network)`,
          retryable: false,
          cause,
        });
      });
      container = await docker.createContainer(createOptions);
    }

    try {
      await container.start();
    } catch (error) {
      throw new SandboxError({
        kind: "driver_unavailable",
        message: "Docker container failed to start",
        retryable: true,
        cause: error,
      });
    }

    const sandbox = new LocalDockerSandbox(docker, container, container.id);
    // Whole-sandbox TTL: a wedged loop can never leak a forever-container.
    sandbox.ttlTimer = setTimeout(() => {
      void sandbox.dispose();
    }, opts.timeoutMs);
    sandbox.ttlTimer.unref?.();
    return sandbox;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const resolved = resolveWorkdirPath(path);
    const dir = resolved.slice(0, resolved.lastIndexOf("/")) || "/";
    const result = await this.execCapture(
      ["sh", "-c", `mkdir -p "$1" && cat > "$2"`, "sh", dir, resolved],
      { timeoutMs: 30_000, stdin: content },
    );
    if (result.exitCode !== 0) {
      throw new SandboxError({
        kind: "protocol",
        message: `writeFile failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
        retryable: false,
      });
    }
  }

  async readFile(path: string): Promise<string> {
    const resolved = resolveWorkdirPath(path);
    const result = await this.execCapture(["cat", resolved], { timeoutMs: 30_000 });
    if (result.exitCode !== 0) {
      throw new SandboxError({
        kind: "not_found",
        message: `readFile failed for ${resolved}: ${result.stderr.slice(0, 500)}`,
        retryable: false,
      });
    }
    return result.stdout;
  }

  async runCommand(cmd: string, opts: RunCommandOptions): Promise<CommandResult> {
    const timeoutSec = Math.max(1, Math.ceil(opts.timeoutMs / 1000));
    // In-container `timeout` (coreutils) is the primary guard: exit 124 when
    // it sends SIGTERM, 137 (128+SIGKILL) when `-k 5` had to escalate. The
    // JS race below is a backstop for a hung daemon connection.
    const wrapped = ["timeout", "-k", "5", String(timeoutSec), "sh", "-c", cmd];
    const started = Date.now();
    const result = await this.execCapture(wrapped, {
      timeoutMs: opts.timeoutMs + TIMEOUT_BACKSTOP_MS,
      ...(opts.cwd !== undefined ? { cwd: resolveWorkdirPath(opts.cwd) } : {}),
      ...(opts.env !== undefined ? { env: opts.env } : {}),
    });
    const durationMs = Date.now() - started;
    // 124/137 alone are ambiguous — a command can legitimately exit with
    // either. Only treat them as a timeout when the elapsed time confirms
    // the wrapper actually fired, so a fast command returning 124 stays a
    // real CommandResult (keeps parity with E2B, which signals timeout
    // explicitly via TimeoutError rather than an exit code).
    const looksTimedOut =
      (result.exitCode === 124 || result.exitCode === 137) && durationMs >= opts.timeoutMs * 0.9;
    if (looksTimedOut) {
      throw new SandboxError({
        kind: "timeout",
        message: `command exceeded ${opts.timeoutMs}ms: ${cmd.slice(0, 200)}`,
        retryable: false,
      });
    }
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs,
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ttlTimer) clearTimeout(this.ttlTimer);
    try {
      await this.container.remove({ force: true });
    } catch (error) {
      // AutoRemove may have beaten us to it (404) or removal is already in
      // progress (409) — both mean "gone", which is what dispose wants.
      if (!isStatusCode(error, 404) && !isStatusCode(error, 409)) {
        throw new SandboxError({
          kind: "driver_unavailable",
          message: "failed to remove sandbox container",
          retryable: true,
          cause: error,
        });
      }
    }
  }

  private async execCapture(
    cmd: string[],
    opts: { timeoutMs: number; cwd?: string; env?: Record<string, string>; stdin?: string },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.disposed) {
      throw new SandboxError({
        kind: "container_died",
        message: "sandbox already disposed",
        retryable: true,
      });
    }

    let exec: Docker.Exec;
    try {
      exec = await this.container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: opts.stdin !== undefined,
        WorkingDir: opts.cwd ?? SANDBOX_WORKDIR,
        Env: Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`),
      });
    } catch (error) {
      throw new SandboxError({
        kind: "container_died",
        message: "sandbox container is gone (exec create failed)",
        retryable: true,
        cause: error,
      });
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutCount = { bytes: 0 };
    const stderrCount = { bytes: 0 };

    const run = async (): Promise<number> => {
      const stream = await exec.start({ hijack: true, stdin: opts.stdin !== undefined });
      this.docker.modem.demuxStream(
        stream,
        capCollector(stdoutChunks, stdoutCount),
        capCollector(stderrChunks, stderrCount),
      );
      if (opts.stdin !== undefined) {
        stream.write(opts.stdin);
        stream.end();
      }
      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("close", resolve);
        stream.on("error", reject);
      });
      const inspected = await exec.inspect();
      return inspected.ExitCode ?? -1;
    };

    let timer: NodeJS.Timeout | undefined;
    const backstop = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new SandboxError({
              kind: "timeout",
              message: `exec did not return within ${opts.timeoutMs}ms (daemon backstop)`,
              retryable: false,
            }),
          ),
        opts.timeoutMs,
      );
      timer.unref?.();
    });

    try {
      const exitCode = await Promise.race([run(), backstop]);
      return {
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      };
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      throw new SandboxError({
        kind: "container_died",
        message: "sandbox exec failed mid-flight",
        retryable: true,
        cause: error,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/**
 * dockerode only honors DOCKER_HOST — it knows nothing about docker
 * contexts, so a Docker Desktop machine (daemon at
 * ~/.docker/desktop/docker.sock) looks "down" through the default socket.
 * Resolve by pinging candidates in order and caching the first that answers.
 */
export async function resolveDocker(): Promise<Docker> {
  const dockerHost = process.env["DOCKER_HOST"];
  if (dockerHost) return new Docker(); // docker-modem parses DOCKER_HOST itself

  const home = homedir();
  const candidates = [
    "/var/run/docker.sock",
    `${home}/.docker/desktop/docker.sock`, // Docker Desktop (Linux/macOS)
    `${home}/.docker/run/docker.sock`, // Docker Desktop (macOS alternate)
    ...(process.env["XDG_RUNTIME_DIR"] ? [`${process.env["XDG_RUNTIME_DIR"]}/docker.sock`] : []), // rootless
  ].filter((socketPath) => existsSync(socketPath));

  for (const socketPath of candidates) {
    const docker = new Docker({ socketPath });
    try {
      await docker.ping();
      return docker;
    } catch {
      // Socket file exists but nothing answers — try the next one.
    }
  }
  throw new SandboxError({
    kind: "driver_unavailable",
    message: `Docker daemon unreachable (tried: ${candidates.join(", ") || "no sockets found"})`,
    retryable: true,
  });
}

export class LocalDockerDriver implements SandboxDriver {
  readonly name = "local" as const;
  private docker: DockerodeLike | undefined;

  constructor(docker?: DockerodeLike) {
    this.docker = docker;
  }

  async create(opts: CreateSandboxOptions): Promise<Sandbox> {
    this.docker ??= (await resolveDocker()) as unknown as DockerodeLike;
    return LocalDockerSandbox.create(this.docker, opts);
  }
}

/** Remove any leftover containers labeled with the given run id (crash reaper, ADR-46). */
export async function reapContainersForRun(runId: string, dockerImpl?: Docker): Promise<number> {
  let docker: Docker;
  try {
    docker = dockerImpl ?? (await resolveDocker());
  } catch {
    return 0; // daemon down — nothing to reap
  }
  let containers: Docker.ContainerInfo[];
  try {
    containers = await docker.listContainers({
      all: true,
      filters: { label: [`${RUN_ID_LABEL}=${runId}`] },
    });
  } catch {
    return 0; // daemon down — nothing to reap
  }
  let reaped = 0;
  for (const info of containers) {
    try {
      await docker.getContainer(info.Id).remove({ force: true });
      reaped += 1;
    } catch {
      // Already auto-removed — fine.
    }
  }
  return reaped;
}
