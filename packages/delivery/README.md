# @mullion/delivery

> Packages and ships a build to the user: zip archive or GitHub push (ADR-54, spec §11).

Packaging and GitHub push only. No live-deploy credentials exist in v1 (ADR-04/15).

## High-level idea

Two delivery targets behind one `DeliveryTarget` interface, offered **the same way** for full and for partial or abandoned builds (ADR-33):

- **Archive**: always available. Zips the produced tree.
- **GitHub**: available only when the user has linked a GitHub account. Creates a private repo and pushes the tree as a single commit.

Every delivery embeds a self-describing `MULLION_BUILD.md` (via `deliverySummaryFile()`), so the recipient knows what they got and how it was built.

## Layout

| File | What |
|---|---|
| `src/port.ts` | The `DeliveryTarget` interface (`available`, `deliver`, `kind`), `DeliveryRequest` / `DeliveryResult`, `deliverySummaryFile()` |
| `src/archive.ts` | `ArchiveDeliveryTarget`: zips with `jszip`, hands the buffer to an injected sink |
| `src/github.ts` | `GitHubDeliveryTarget`: private repo plus one commit via Octokit's git-data API (blobs, then tree, then commit, then ref). `repo` scope only. Idempotent across retries (handles 422 on an existing repo or ref) |
| `src/fake.ts` | `FakeGitHubDeliveryTarget` (an in-memory "remote") and `FakeArchiveDeliveryTarget`, exported via `./testing` |

## Exports

- `.`: the interface, both targets, `deliverySummaryFile`, `GitHubTokenResolver`, `OctokitLike`
- `./testing`: the fakes

## Configuration

No direct env reads. The per-user GitHub token is resolved at delivery time through an injected `GitHubTokenResolver`, backed by Better Auth's `account.accessToken` in the DB. The Octokit client is injected through the constructor (`OctokitLike`), so tests never touch the network.

## Where it fits

Consumed by `apps/api` and `@mullion/orchestrator`. Consumes artifact trees from [`@mullion/artifacts`](../artifacts). Outcomes are recorded in the `deliveries` table.

## Testing

`src/delivery.test.ts` (vitest): exact pushed and zipped file sets, partial-build parity, and idempotency, using the in-memory artifact store and the fakes. `pnpm test`.
