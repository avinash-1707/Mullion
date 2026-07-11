# @mullion/sandbox

> Provider-agnostic sandbox interface for running untrusted generated code (ADR-44).

Ships a hardened local Docker driver as the real v1 substrate, and an E2B driver stub behind the same contract. Swapping drivers is a config change. No driver internals leak into the interface.

## High-level idea

Generated code is hostile until proven otherwise. The core semantic of the interface: a command that ran always resolves. A non-zero exit code is a signal, not an exception. Throws are reserved for failures of the sandbox itself. `resolveWorkdirPath` gives pure path-escape protection on every file operation, and all work happens under `SANDBOX_WORKDIR` (`/workspace`).

The local Docker driver is deliberately paranoid (ADR-47): **no network**, read-only root filesystem, tmpfs workdir, all capabilities dropped, `no-new-privileges`, pids/memory/CPU limits, non-root user, auto-remove. Default image is `node:22-bookworm-slim`. The toolchain must be baked into the image, because the sandbox cannot fetch anything.

## Layout

| File | What |
|---|---|
| `src/port.ts` | The contract: `Sandbox`, `SandboxDriver`, `CommandResult`, `SandboxError`, `resolveWorkdirPath`, `SANDBOX_WORKDIR` |
| `src/local/docker-sandbox.ts` | `LocalDockerDriver`: the hardened container above. Also `reapContainersForRun` and `reapStaleContainers` (orphan cleanup) and `resolveDocker` (rootless socket discovery) |
| `src/e2b/e2b-sandbox.ts` | `E2bDriver`: proves the interface binding, but not yet at network/resource isolation parity |
| `src/select.ts` | `createSandboxDriver(config)`: picks local or e2b. The e2b branch currently throws (parity and egress test pending). Bad config fails at construction |
| `src/testing/fake-sandbox.ts` | In-memory `FakeSandbox`, exported via `./testing` |

## Exports

- `.`: the contract types, `LocalDockerDriver`, `E2bDriver`, `createSandboxDriver`, the reapers, `DEFAULT_SANDBOX_IMAGE`
- `./testing`: `FakeSandbox`

## Configuration

`SANDBOX_DRIVER` (`local` or `e2b`) and `E2B_API_KEY` arrive via `SandboxDriverConfig` from the caller. The Docker driver reads `DOCKER_HOST` and `XDG_RUNTIME_DIR` directly for socket discovery. Image comes from `SANDBOX_IMAGE`.

## Where it fits

A leaf package with no workspace dependencies. Consumed by `@mullion/agents` (`buildTask` runs its tools against a `Sandbox`) and `@mullion/orchestrator` (creates the driver, one sandbox per task, reaps orphans). External deps: `dockerode`, `e2b`.

## Testing

Vitest. Unit: `port.test.ts`, `local/reaper.test.ts`, `e2b/e2b-sandbox.test.ts`. Integration (needs Docker): `local/docker-sandbox.integration.test.ts` and `egress.integration.test.ts`. The egress test proves the no-network guarantee instead of just asserting it. `pnpm test:integration`.
