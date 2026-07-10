import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import {
  agentMessageEnvelopeSchema,
  type AgentMessageEnvelope,
  type TaskResult,
  type TaskStatus,
} from "@mullion/schemas";

/**
 * Durable per-turn persistence (ADR-46): every envelope commits as it
 * happens, so a crashed loop leaves a complete transcript up to the last
 * committed turn. No stream_events here — M1 has no UI; the messages table
 * is the sole transcript store (M5 adds the SSE feed).
 */

export interface PersistContext {
  organizationId: string;
  runId: string;
  taskRowId: string;
}

export async function appendMessage(
  db: Db,
  ctx: PersistContext,
  envelope: AgentMessageEnvelope,
): Promise<void> {
  // Validate on write, so the "validated on write and on read" contract is
  // actually true at the DB boundary (jsonb otherwise stores anything). The
  // caller's own caps keep valid envelopes under the schema bounds; a parse
  // failure here is a real bug surfaced early, not silent corruption later.
  const validated = agentMessageEnvelopeSchema.parse(envelope);
  await db.insert(schema.messages).values({
    organizationId: ctx.organizationId,
    runId: ctx.runId,
    taskId: ctx.taskRowId,
    envelope: validated,
  });
}

export async function setTaskStatus(
  db: Db,
  ctx: PersistContext,
  status: TaskStatus,
  result?: TaskResult,
): Promise<void> {
  await db
    .update(schema.tasks)
    .set({ status, ...(result !== undefined ? { result } : {}) })
    .where(
      and(
        eq(schema.tasks.id, ctx.taskRowId),
        eq(schema.tasks.organizationId, ctx.organizationId),
      ),
    );
}

/**
 * Sandbox cost capture (ADR-28): modeled as duration × configured rate so
 * the cost path is exercised even on free local Docker — swapping in E2B
 * changes the rate's meaning, not the plumbing.
 */
export async function recordSandboxCost(
  db: Db,
  ctx: PersistContext & { userId?: string | undefined },
  args: { durationMs: number; costUsd: number },
): Promise<void> {
  await db.insert(schema.costEvents).values({
    organizationId: ctx.organizationId,
    userId: ctx.userId ?? null,
    runId: ctx.runId,
    source: "sandbox",
    cost: args.costUsd.toFixed(8),
    usage: { durationMs: args.durationMs },
  });
}
