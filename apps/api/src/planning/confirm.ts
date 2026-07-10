import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema } from "@mullion/db";
import { buildSpecArtifactSchema, type BuildSpecArtifact } from "@mullion/schemas";
import { db } from "../db.js";
import {
  publishPlanningEvent,
  toGraphEdge,
  toGraphNode,
  toRequirementsVersion,
  type SessionRow,
} from "./state.js";

import { canonicalJson } from "./hash.js";

/**
 * Confirmation & freeze (01 §5 / 02 §2.5): bundle requirements + graph +
 * task graph + decision-log ids into one immutable, content-hashed Build
 * Spec. Immutability is enforced by the DB trigger from migration 0002;
 * this module's job is producing the artifact deterministically.
 */

export class ConfirmBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmBlockedError";
  }
}

export async function confirmAndFreeze(
  session: SessionRow,
): Promise<{ buildSpecId: string; contentHash: string }> {
  const requirementsRows = await db
    .select()
    .from(schema.requirementsDocs)
    .where(eq(schema.requirementsDocs.sessionId, session.id))
    .orderBy(asc(schema.requirementsDocs.version));
  const latestRequirements = requirementsRows.at(-1);
  if (!latestRequirements) {
    throw new ConfirmBlockedError("No requirements document to freeze");
  }

  const [nodeRows, edgeRows, decisionRows] = await Promise.all([
    db
      .select()
      .from(schema.graphNodes)
      .where(eq(schema.graphNodes.sessionId, session.id))
      .orderBy(asc(schema.graphNodes.nodeKey)),
    db
      .select()
      .from(schema.graphEdges)
      .where(eq(schema.graphEdges.sessionId, session.id))
      .orderBy(asc(schema.graphEdges.sourceKey), asc(schema.graphEdges.targetKey)),
    db
      .select({ id: schema.decisionLog.id })
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.sessionId, session.id))
      .orderBy(asc(schema.decisionLog.createdAt)),
  ]);

  const activeNodes = nodeRows.filter((n) => n.status === "active").map(toGraphNode);
  const activeEdges = edgeRows.filter((e) => e.status === "active").map(toGraphEdge);
  const tasks = activeNodes.filter((n) => n.kind === "task");
  if (activeNodes.length === 0 || tasks.length === 0) {
    throw new ConfirmBlockedError("Architecture graph has no nodes or no task graph yet");
  }

  const buildSpecId = crypto.randomUUID();
  const frozenAt = new Date().toISOString();
  const hashedContent = {
    requirements: toRequirementsVersion(latestRequirements).doc,
    architecture_graph: {
      nodes: activeNodes.map((n) => ({
        nodeKey: n.nodeKey,
        kind: n.kind,
        label: n.label,
        description: n.description,
      })),
      edges: activeEdges.map((e) => ({
        sourceKey: e.sourceKey,
        targetKey: e.targetKey,
        ...(e.label ? { label: e.label } : {}),
      })),
    },
    task_graph: tasks.map((t) => ({
      task_id: t.nodeKey,
      description: `${t.label}: ${t.description}`.trim(),
      acceptance_criteria: t.acceptanceCriteria ?? "",
      depends_on: t.dependsOn,
    })),
    decision_log_ids: decisionRows.map((d) => d.id),
  };
  const contentHash = `sha256:${createHash("sha256").update(canonicalJson(hashedContent)).digest("hex")}`;

  const artifact: BuildSpecArtifact = buildSpecArtifactSchema.parse({
    build_spec_id: buildSpecId,
    content_hash: contentHash,
    ...hashedContent,
    frozen_at: frozenAt,
  });

  await db.transaction(async (tx) => {
    // Atomic gate against TOCTOU races (confirm vs edit/abandon/confirm):
    // the freeze only lands if the session is still active, no agent holds
    // the slot, and the graph is exactly the version the consistency pass
    // verified. Zero rows = something moved; the whole tx rolls back.
    const gated = await tx
      .update(schema.planningSessions)
      .set({ status: "confirmed", agentState: "idle", agentTask: null, agentError: null })
      .where(
        and(
          eq(schema.planningSessions.id, session.id),
          eq(schema.planningSessions.status, "active"),
          eq(schema.planningSessions.agentState, "idle"),
          eq(schema.planningSessions.graphVersion, session.graphVersion),
        ),
      )
      .returning({ id: schema.planningSessions.id });
    if (!gated[0]) {
      throw new ConfirmBlockedError(
        "The session changed while confirming — review the latest state and try again",
      );
    }
    await tx.insert(schema.buildSpecs).values({
      id: buildSpecId,
      organizationId: session.organizationId,
      sessionId: session.id,
      contentHash,
      spec: artifact,
    });
    // Back-link the session's decisions to the spec they became part of —
    // Fork B's agents read them as design memory (02 §4.1).
    const decisionIds = decisionRows.map((d) => d.id);
    if (decisionIds.length > 0) {
      await tx
        .update(schema.decisionLog)
        .set({ buildSpecId })
        .where(inArray(schema.decisionLog.id, decisionIds));
    }
    await publishPlanningEvent(tx, session, { type: "frozen", buildSpecId, contentHash });
    await publishPlanningEvent(tx, session, {
      type: "phase",
      phase: "architecture",
      status: "confirmed",
    });
  });

  return { buildSpecId, contentHash };
}
