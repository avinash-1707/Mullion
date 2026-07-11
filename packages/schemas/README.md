# @mullion/schemas

> Single source of truth for shared Zod contracts: API bodies, agent I/O, and the frozen Build Spec.

The API, the Next.js client, and the agent output parsers all import the same schemas, so nothing is duplicated per side (CODING_STANDARDS §8).

## High-level idea

The database stores flexible shapes as untyped JSONB. This package is where those shapes get their type. Every boundary (HTTP handler, SSE event, LLM tool call, agent message envelope) validates against a schema defined here exactly once. Each module exports both the Zod object (`*Schema`) and the inferred TypeScript type.

The only runtime dependency is `zod`. No workspace deps. This package sits below everything and depends on nothing internal.

## Layout

| File | Contract |
|---|---|
| `src/agent-roles.ts` | `agentRoleSchema`: the ADR-14 roster (analyst / planner / coder / tester / reviewer / devops), used at every LLM call site |
| `src/build-spec.ts` | `buildSpecArtifactSchema`: the frozen §2.5 artifact with requirements, architecture graph, task graph, decision-log ids, and a content hash |
| `src/api.ts` | One schema per API route (create planning session, stream events, and so on) |
| `src/planning.ts` | Phase 1 to 3 contracts: MCQ questions and answers, requirements, consistency results |
| `src/coder-tools.ts` | Coder tool-argument schemas with hard size caps (`writeFile` / `readFile` / `runCommand` / `submit`), plus tool-name and task-status enums |
| `src/agent-message.ts` | `agentMessageEnvelopeSchema`: a discriminated union (system / user / assistant / tool). This is the `messages.envelope` shape, validated on read **and** write |
| `src/tester.ts` | `testReportSchema`, `verificationOutcomeSchema`. The runner decides pass or fail; the LLM only parses failures |
| `src/reviewer.ts` | `buildReviewNoteSchema`, `buildReviewVerdictSchema`: advisory build-review output |

## Exports

`.`: everything above. Each file exports both the Zod schemas and the inferred types.

## Configuration

None.

## Where it fits

Consumed by `apps/web`, `apps/api`, `@mullion/orchestrator`, `@mullion/agents`, `@mullion/evals`, and `@mullion/llm`. Depends on nothing internal.

## Testing

No dedicated tests. The contracts are exercised by every consumer's suite, and `check-types` guards the package itself.
