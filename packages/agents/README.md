# @mullion/agents

> The AI-agent layer: prompts, parsing, and the tool loop that drives a coding task to a machine-verified result.

Covers every role in the system (Analyst, Planner, Coder, Tester, Reviewer, Consistency, per ADR-14).

## High-level idea

LLM interaction logic stays pure and testable, separate from IO. An agent is an `AgentSpec<TIn, TOut>`: `buildMessages` in, `parse` out, run by `runAgent` with retry.

The Coder is different. It is a multi-turn tool loop (`buildTask`) against a sandbox, with hard caps and a combined LLM + sandbox budget breaker (ADR-31). Verification is out of the model's hands: the `submit` tool takes no arguments, so the model cannot grade its own work. Pass or fail comes from running the task's verify command in the sandbox and reading the exit code.

All dependencies (LLM client, sandbox, db, caps, budget) are injected. This package reads no env vars and never creates or disposes sandboxes. That lifecycle belongs to the caller.

## Layout

| Module | What |
|---|---|
| `src/agent.ts` | `AgentSpec` contract + `runAgent` one-shot runner with retry |
| `src/analyst.ts` | Loose idea to capped MCQ rounds to a Requirements Document |
| `src/planner.ts` | Planner/Architect. Emits JSONL graph decisions, streamed and parsed incrementally |
| `src/consistency.ts` | Planning consistency gate: deterministic `checkGraphStructure` plus an LLM review |
| `src/coder/build-task.ts` | **The heart.** The tool-loop runner: writeFile / readFile / runCommand / submit turns, caps, budget, verification |
| `src/coder/tools.ts` | Fixed Coder toolset (`CODER_TOOL_DEFINITIONS`, `parseToolCall`) |
| `src/coder/persist.ts` | Durable per-turn transcript persistence, envelope-validated on write |
| `src/coder/verify.ts` | `inlineVerifier` + the `Verifier` contract. The verify command runs in the sandbox, the exit code decides |
| `src/tester/` | Tester agent: turns raw test output into actionable failures. `makeTesterVerifier` wires it up as a `Verifier` |
| `src/reviewer/reviewer.ts` | One-shot advisory build review over the produced repo |
| `src/budget.ts` | ADR-31 combined cost breaker (`checkBudget`, `assertBudget`, `BudgetExceededError`) |
| `src/retry.ts` | `withBackoff` + retryability. Planning-phase retry, separate from build escalation (ADR-07) |
| `src/json.ts` | `JsonlAccumulator`, `parseJsonWith`, `stripCodeFence` |

## Exports

- `.`: all agents, `buildTask` with `DEFAULT_TASK_CAPS` and `BuildTaskDeps`, tool definitions, verifiers, budget, retry, and JSON helpers
- `./testing`: a scripted LLM fake for deterministic tests

## Configuration

None read directly. Everything arrives via `BuildTaskDeps` and function arguments.

## Where it fits

Consumed by `@mullion/orchestrator` (activities call `buildTask` and the reviewer) and by the API's planning service (analyst, planner, consistency). Consumes `@mullion/llm`, `@mullion/sandbox` (the `Sandbox` interface), `@mullion/db`, and `@mullion/schemas`.

## Testing

Vitest, tests next to the code. `pnpm test` runs unit tests. `pnpm test:integration` adds the `*.integration.test.ts` files, which run real Docker sandbox loops.
