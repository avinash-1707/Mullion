import { and, asc, desc, eq, max } from "drizzle-orm";
import { schema } from "@mullion/db";
import { consistencyResultSchema, type PlanningSnapshot } from "@mullion/schemas";
import { db } from "../../lib/db.js";
import {
  toDecisionEntry,
  toGraphEdge,
  toGraphNode,
  toMcqRound,
  toRequirementsVersion,
  type SessionRow,
} from "./state.js";

/**
 * Full page-load state in one read (01 §0 — leave and resume any time).
 * The SSE stream then resumes from `lastEventId`, so a fresh tab never
 * replays what the snapshot already contains.
 */
export async function getSnapshot(session: SessionRow): Promise<PlanningSnapshot> {
  const [creatorRows, roundRows, requirementsRows, nodeRows, edgeRows, decisionRows, specRows, lastEvent] =
    await Promise.all([
      db
        .select({ name: schema.user.name, image: schema.user.image })
        .from(schema.user)
        .where(eq(schema.user.id, session.userId))
        .limit(1),
      db
        .select()
        .from(schema.mcqRounds)
        .where(eq(schema.mcqRounds.sessionId, session.id))
        .orderBy(asc(schema.mcqRounds.round)),
      db
        .select()
        .from(schema.requirementsDocs)
        .where(eq(schema.requirementsDocs.sessionId, session.id))
        .orderBy(desc(schema.requirementsDocs.version))
        .limit(1),
      db
        .select()
        .from(schema.graphNodes)
        .where(eq(schema.graphNodes.sessionId, session.id))
        .orderBy(asc(schema.graphNodes.createdAt)),
      db
        .select()
        .from(schema.graphEdges)
        .where(eq(schema.graphEdges.sessionId, session.id))
        .orderBy(asc(schema.graphEdges.createdAt)),
      db
        .select()
        .from(schema.decisionLog)
        .where(eq(schema.decisionLog.sessionId, session.id))
        .orderBy(asc(schema.decisionLog.createdAt)),
      db
        .select({
          id: schema.buildSpecs.id,
          contentHash: schema.buildSpecs.contentHash,
          frozenAt: schema.buildSpecs.frozenAt,
        })
        .from(schema.buildSpecs)
        .where(eq(schema.buildSpecs.sessionId, session.id))
        .limit(1),
      db
        .select({ id: max(schema.streamEvents.id) })
        .from(schema.streamEvents)
        .where(
          and(
            eq(schema.streamEvents.streamId, session.id),
            eq(schema.streamEvents.organizationId, session.organizationId),
          ),
        ),
    ]);

  const requirements = requirementsRows[0];
  const spec = specRows[0];
  const consistencyParsed = consistencyResultSchema.nullable().safeParse(session.consistency);

  return {
    session: {
      id: session.id,
      organizationId: session.organizationId,
      userId: session.userId,
      userName: creatorRows[0]?.name ?? "",
      userImage: creatorRows[0]?.image ?? null,
      status: session.status,
      phase: session.phase,
      agentState: session.agentState,
      agentError: session.agentError,
      idea: session.idea,
      graphVersion: session.graphVersion,
      createdAt: session.createdAt.toISOString(),
    },
    rounds: roundRows.map(toMcqRound),
    requirements: requirements ? toRequirementsVersion(requirements) : null,
    nodes: nodeRows.map(toGraphNode),
    edges: edgeRows.map(toGraphEdge),
    decisions: decisionRows.map(toDecisionEntry),
    consistency: consistencyParsed.success ? consistencyParsed.data : null,
    buildSpec: spec
      ? { id: spec.id, contentHash: spec.contentHash, frozenAt: spec.frozenAt.toISOString() }
      : null,
    lastEventId: lastEvent[0]?.id ?? 0,
  };
}
