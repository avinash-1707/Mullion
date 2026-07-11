# @mullion/evals

> Eval harness that measures build quality per system version (ADR-12/60).

Runs frozen build-task graphs through the **real** `buildTask` loop, real sandbox, and real retry policy (no Temporal), then aggregates quality metrics and renders a trend line over time.

## High-level idea

"Did the last change make the build agents better or worse?" needs a number, not a vibe. The harness runs the same task, retry, and cost code paths that production uses, against fixed task fixtures with known expected outcomes. It aggregates four metrics (ADR-12): pass rate, retries, escalations, and cost.

Each run appends an `EvalRunRecord` to `docs/evals/history.jsonl`. `trend.ts` renders that file into a markdown trend table with per-mode deltas (`docs/evals/trend.md`). CI reports results via job summary and artifacts, and never commits to main (ADR-61).

Three modes:

| Mode | LLM | Needs |
|---|---|---|
| `scripted` | Scripted fake | Postgres + Docker only |
| `live` | Real OpenRouter | `OPENROUTER_API_KEY` |
| `replay` | ADR-11 cassettes | Recorded cassettes (hard-fails on a miss) |

## Layout

| File | What |
|---|---|
| `src/tasks.ts` | `EVAL_TASKS`: frozen graphs plus expected outcomes |
| `src/harness.ts` | `runEvalTask`, `ensureEvalPrincipal`, `failStuckEvalRuns`. Drives the real `buildTask` with `RETRY_BUDGET` and `dispositionFor`, persisting to production tables under a dedicated eval org and user |
| `src/metrics.ts` | The four metrics plus `aggregate()` |
| `src/run-evals.ts` | CLI runner (`--mode`, `--only`) |
| `src/trend.ts` | Renders `history.jsonl` into the markdown trend table |

## Usage

```
pnpm evals                      # scripted mode
pnpm evals -- --mode live       # real models
pnpm evals -- --mode replay     # cassettes only
pnpm evals -- --only <task-id>  # subset
pnpm trend                      # regenerate docs/evals/trend.md
```

## Configuration

Env comes from `apps/api/.env` (the script runs `tsx --env-file=../../apps/api/.env`).

## Where it fits

A standalone quality gate, used by CI and humans. Consumes `@mullion/agents`, `@mullion/orchestrator` (policy only), `@mullion/sandbox`, `@mullion/llm`, and `@mullion/db`.

## Testing

Vitest: `tasks.test.ts`, `metrics.test.ts`. `pnpm test`.
