import { asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { schema } from "@mullion/db";
import { buildSpecArtifactSchema } from "@mullion/schemas";
import { db } from "../db.js";
import { renderDiagramSvg } from "./diagram.js";
import {
  renderArchitectureMd,
  renderDecisionLogMd,
  renderRequirementsMd,
  renderTaskGraphMd,
} from "./render.js";
import { toDecisionEntry, type SessionRow } from "./state.js";

/**
 * Fork A (01 §6): the frozen Build Spec rendered into a downloadable
 * bundle. Generated on demand from Postgres — the spec is immutable, so the
 * bundle is reproducible byte-for-byte modulo zip timestamps; S3 storage of
 * bundles waits until Phase 2 gives us artifacts that can't be re-derived.
 */
export async function buildExportBundle(
  session: SessionRow,
): Promise<{ filename: string; content: Uint8Array } | null> {
  const specRows = await db
    .select()
    .from(schema.buildSpecs)
    .where(eq(schema.buildSpecs.sessionId, session.id))
    .limit(1);
  const specRow = specRows[0];
  if (!specRow) return null;

  const artifact = buildSpecArtifactSchema.parse(specRow.spec);
  const decisions = (
    await db
      .select()
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.sessionId, session.id))
      .orderBy(asc(schema.decisionLog.createdAt))
  ).map(toDecisionEntry);

  const zip = new JSZip();
  zip.file("build-spec.json", JSON.stringify(artifact, null, 2));
  zip.file("requirements.md", renderRequirementsMd(artifact));
  zip.file("architecture.md", renderArchitectureMd(artifact, decisions));
  zip.file("architecture-graph.json", JSON.stringify(artifact.architecture_graph, null, 2));
  zip.file("task-graph.md", renderTaskGraphMd(artifact));
  zip.file("task-graph.json", JSON.stringify(artifact.task_graph, null, 2));
  zip.file("decision-log.md", renderDecisionLogMd(decisions));
  zip.file("decision-log.json", JSON.stringify(decisions, null, 2));
  zip.file("diagram.svg", renderDiagramSvg(artifact));

  const content = await zip.generateAsync({ type: "uint8array" });
  return { filename: `mullion-spec-${specRow.id.slice(0, 8)}.zip`, content };
}
