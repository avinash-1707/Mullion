/**
 * Provider-agnostic sandbox port (ADR-44). M2/M3/M4 bind to this contract —
 * no driver concept (E2B session objects, Docker container handles) may leak
 * into it, or the "swap = config change" guarantee dies.
 *
 * Load-bearing semantics: a command that RAN to completion always resolves
 * to a CommandResult — a non-zero exit code is signal for the agent loop,
 * never a thrown error. Throws are reserved for the sandbox itself failing
 * (timeout, death, protocol violation).
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
  /** 0..255 — the real exit code of a command that ran. */
  exitCode: number;
  /** Wall-clock duration — feeds sandbox cost attribution (ADR-28). */
  durationMs: number;
}

export interface RunCommandOptions {
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  /** Per-command hard cap — required, no unbounded exec. */
  timeoutMs: number;
}

export interface Sandbox {
  readonly id: string;
  /** Paths resolve under the sandbox workdir; escape → SandboxError('protocol'). */
  writeFile(path: string, content: string): Promise<void>;
  /** Missing file → SandboxError('not_found'). */
  readFile(path: string): Promise<string>;
  runCommand(cmd: string, opts: RunCommandOptions): Promise<CommandResult>;
  /** Idempotent — safe to call twice. */
  dispose(): Promise<void>;
}

export interface CreateSandboxOptions {
  /** Container image / E2B template. Driver default applies if omitted. */
  image?: string | undefined;
  envs?: Record<string, string> | undefined;
  /** Whole-sandbox TTL. */
  timeoutMs: number;
  /** Attribution label so an orphaned sandbox can be traced to its run. */
  runId?: string | undefined;
}

export interface SandboxDriver {
  readonly name: "local" | "e2b";
  create(opts: CreateSandboxOptions): Promise<Sandbox>;
}

export type SandboxErrorKind =
  | "timeout" // command exceeded timeoutMs
  | "container_died" // OOM-kill, pids-limit, daemon/connection lost mid-run
  | "not_found" // readFile of a missing path
  | "driver_unavailable" // Docker daemon down / E2B unreachable at create()
  | "protocol"; // path escaped workdir, invalid argument

/** Driver-neutral failure — callers branch on `kind`/`retryable`, never on message text. */
export class SandboxError extends Error {
  readonly kind: SandboxErrorKind;
  readonly retryable: boolean;

  constructor(args: {
    kind: SandboxErrorKind;
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = "SandboxError";
    this.kind = args.kind;
    this.retryable = args.retryable;
  }
}

/** The single workdir every driver exposes; all tool paths resolve under it. */
export const SANDBOX_WORKDIR = "/workspace";

/**
 * Resolve a tool-supplied path under the workdir, rejecting `..`/absolute
 * escapes. Pure string logic (no fs) so it is identical across drivers.
 *
 * This is defense-in-depth, NOT containment: it stops a *string* from
 * naming a path outside /workspace, but it cannot stop a symlink the model
 * creates inside the sandbox (`ln -s / /workspace/root`) from resolving out
 * at read time. Containment is the sandbox boundary itself (read-only
 * rootfs, no network, no secrets in the image). When real mounts/secrets
 * arrive (E2B, M2+), add an in-sandbox realpath check under /workspace.
 */
export function resolveWorkdirPath(path: string): string {
  // Normalize backslashes to '/' for symmetry with assertSafeArtifactPath —
  // defense-in-depth (the container is Linux; containment is the boundary).
  const normalized = path.replace(/\\/g, "/");
  const candidate = normalized.startsWith("/") ? normalized : `${SANDBOX_WORKDIR}/${normalized}`;
  const segments: string[] = [];
  for (const part of candidate.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) {
        throw new SandboxError({
          kind: "protocol",
          message: `path escapes sandbox workdir: ${path}`,
          retryable: false,
        });
      }
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  const resolved = `/${segments.join("/")}`;
  if (resolved !== SANDBOX_WORKDIR && !resolved.startsWith(`${SANDBOX_WORKDIR}/`)) {
    throw new SandboxError({
      kind: "protocol",
      message: `path escapes sandbox workdir: ${path}`,
      retryable: false,
    });
  }
  return resolved;
}
