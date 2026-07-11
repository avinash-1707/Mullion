# @mullion/orchestrator

> The durable build state machine, on Temporal.

Owns the per-run flow: topological task ordering, per-task retry budget, the human escalation gate, an advisory review, and delivery. Every side effect lives in activities, so the workflow itself stays deterministic and replay-safe.

## High-level idea

A build that crashes mid-run must resume exactly where it stopped. That is what Temporal buys us (ADR-10/50). The split is strict:

- **`workflows.ts`** holds `buildRunWorkflow`, the deterministic state machine. It imports only `@temporalio/workflow` plus the pure `policy` and `types` modules. No IO, ever.
- **`activities.ts`** holds `createActivities(deps)`, a dependency-injection factory with all the side effects: Postgres, Docker sandboxes, LLM calls, artifact snapshots, delivery, SSE publishing.
- **`policy.ts`** holds pure decisions: `RETRY_BUDGET`, a deterministic Kahn `topoSort`, and `dispositionFor` (retry vs terminal).

Escalation (ADR-07) is a Temporal signal. When a task uses up its retry budget, the workflow publishes an escalation and waits for a decision: approve, redirect, or abandon. A timeout defaults to abandon. The review step is advisory and never blocks delivery. Every terminal path ships something: full, partial, or abandoned (ADR-33).

Workflow IDs are deterministic (`build:<runId>` with REJECT_DUPLICATE), so starting the same run twice is impossible by construction.

## Layout

| File | What |
|---|---|
| `src/workflows.ts` | `buildRunWorkflow` + `escalationSignal` |
| `src/activities.ts` | `createActivities`: `loadTaskGraph`, `runTask` (calls `buildTask`), `setRunStatus`, `publishEscalation`, `review`, `ship`, and more |
| `src/policy.ts` | Retry budget, task queue name, topo sort, disposition |
| `src/worker.ts` | `createBuildWorker` factory + `WORKFLOWS_PATH`, optional OTel interceptors |
| `src/client.ts` | `startBuildRun`, `workflowIdForRun` |
| `src/types.ts` | Type-only surface. Keeps the workflow isolate free of runtime imports |

## Exports

`.`: policy primitives (`RETRY_BUDGET`, `topoSort`, `dispositionFor`), `createActivities` / `ActivityDeps`, `createBuildWorker` / `WORKFLOWS_PATH`, `startBuildRun` / `workflowIdForRun`, `buildRunWorkflow`, `escalationSignal`, and the type-only surface.

## Configuration

Nothing is read directly. The Temporal connection and namespace, task queue, and all `ActivityDeps` are injected by the caller (`apps/api/src/worker.ts`).

## Where it fits

Consumed by `apps/api`, which starts runs and hosts the worker process with the real dependencies. Consumes `@mullion/agents`, `@mullion/sandbox`, `@mullion/artifacts`, `@mullion/delivery`, `@mullion/db`, and `@mullion/otel`.

## Testing

Vitest. Unit: `policy.test.ts`, `activities.test.ts`. Integration uses `@temporalio/testing` (a time-skipping test server): `workflow.integration.test.ts` and friends, via `pnpm test:integration`.
