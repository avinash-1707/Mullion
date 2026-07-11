import type { BuildSpecArtifact, DecisionEntry } from "@mullion/schemas";

/**
 * Fork A document rendering (01 §6): the frozen Build Spec → human-readable
 * markdown. Pure functions — testable without a server or a database.
 */

function section(title: string, items: string[]): string {
  if (items.length === 0) return `## ${title}\n\n_None._\n`;
  return `## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n`;
}

export function renderRequirementsMd(artifact: BuildSpecArtifact): string {
  const req = artifact.requirements as {
    summary?: string;
    functionalRequirements?: string[];
    nonFunctionalConstraints?: string[];
    assumptions?: string[];
    scope?: { inV1?: string[]; outOfV1?: string[] };
  };
  return [
    `# Requirements Document`,
    ``,
    req.summary ?? "",
    ``,
    section("Functional requirements", req.functionalRequirements ?? []),
    section("Non-functional constraints", req.nonFunctionalConstraints ?? []),
    section("Assumptions (explicit, unconfirmed)", req.assumptions ?? []),
    section("In scope for v1", req.scope?.inV1 ?? []),
    section("Out of scope for v1", req.scope?.outOfV1 ?? []),
    `---`,
    `Frozen at ${artifact.frozen_at} · Build Spec ${artifact.build_spec_id} · ${artifact.content_hash}`,
    ``,
  ].join("\n");
}

interface ArtifactNode {
  nodeKey: string;
  kind: string;
  label: string;
  description: string;
}

interface ArtifactEdge {
  sourceKey: string;
  targetKey: string;
  label?: string;
}

export function artifactNodes(artifact: BuildSpecArtifact): ArtifactNode[] {
  return artifact.architecture_graph.nodes as ArtifactNode[];
}

export function artifactEdges(artifact: BuildSpecArtifact): ArtifactEdge[] {
  return artifact.architecture_graph.edges as ArtifactEdge[];
}

export function renderArchitectureMd(
  artifact: BuildSpecArtifact,
  decisions: DecisionEntry[],
): string {
  const nodes = artifactNodes(artifact);
  const edges = artifactEdges(artifact);
  const byKind = (kind: string) =>
    nodes
      .filter((n) => n.kind === kind)
      .map((n) => `- **${n.label}** (\`${n.nodeKey}\`): ${n.description}`);

  const flows = edges.map((e) => `- \`${e.sourceKey}\` → \`${e.targetKey}\`${e.label ? ` — ${e.label}` : ""}`);

  const architectureDecisions = decisions
    .filter((d) => d.phase === "architecture" && d.actor !== "user")
    .map((d) => {
      const parts = [`### ${d.decision}`, ``, d.rationale ?? ""];
      if (d.alternativesConsidered) {
        parts.push(``, `_Alternatives considered:_ ${d.alternativesConsidered}`);
      }
      return parts.join("\n");
    });

  return [
    `# Architecture`,
    ``,
    `See \`diagram.svg\` for the rendered diagram and \`architecture-graph.json\` for the structured graph.`,
    ``,
    `## Services\n\n${byKind("service").join("\n") || "_None._"}`,
    ``,
    `## Datastores\n\n${byKind("datastore").join("\n") || "_None._"}`,
    ``,
    `## External dependencies\n\n${byKind("external").join("\n") || "_None._"}`,
    ``,
    `## Data & call flow\n\n${flows.join("\n") || "_None._"}`,
    ``,
    `## Decisions`,
    ``,
    architectureDecisions.join("\n\n"),
    ``,
  ].join("\n");
}

export function renderTaskGraphMd(artifact: BuildSpecArtifact): string {
  const tasks = artifact.task_graph.map((t) => {
    const deps = t.depends_on.length > 0 ? `Depends on: ${t.depends_on.map((d) => `\`${d}\``).join(", ")}` : "No dependencies";
    return [`### ${t.task_id}`, ``, t.description, ``, `**Acceptance criteria:** ${t.acceptance_criteria}`, ``, deps].join("\n");
  });
  return [`# Task graph`, ``, `${artifact.task_graph.length} tasks. Machine-readable version: \`task-graph.json\`.`, ``, tasks.join("\n\n"), ``].join("\n");
}

export function renderDecisionLogMd(decisions: DecisionEntry[]): string {
  const rows = decisions.map((d) => {
    const lines = [
      `### [${d.phase}] ${d.decision}`,
      ``,
      `- **Actor:** ${d.actor}`,
      `- **At:** ${d.createdAt}`,
    ];
    if (d.rationale) lines.push(`- **Rationale:** ${d.rationale}`);
    if (d.alternativesConsidered) lines.push(`- **Alternatives considered:** ${d.alternativesConsidered}`);
    return lines.join("\n");
  });
  return [`# Decision log`, ``, `Every decision made during planning, agent and user alike, in order.`, ``, rows.join("\n\n"), ``].join("\n");
}
