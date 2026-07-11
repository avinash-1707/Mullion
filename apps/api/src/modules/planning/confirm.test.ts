import { describe, expect, it } from "vitest";
import type { BuildSpecArtifact } from "@mullion/schemas";
import { canonicalJson } from "./hash.js";
import { renderDiagramSvg } from "./diagram.js";
import { renderArchitectureMd, renderRequirementsMd, renderTaskGraphMd } from "./render.js";

describe("canonicalJson", () => {
  it("is insensitive to key order, including nested", () => {
    const a = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } };
    const b = { a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("keeps array order significant", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

const artifact: BuildSpecArtifact = {
  build_spec_id: "11111111-1111-4111-8111-111111111111",
  content_hash: "sha256:abc",
  requirements: {
    summary: "A thing.",
    functionalRequirements: ["Does <stuff>"],
    nonFunctionalConstraints: [],
    assumptions: ["Assumed & flagged"],
    scope: { inV1: ["Core"], outOfV1: ["Extras"] },
  },
  architecture_graph: {
    nodes: [
      { nodeKey: "api", kind: "service", label: "API <server>", description: "Handles requests" },
      { nodeKey: "db", kind: "datastore", label: "Postgres", description: "Stores data" },
    ],
    edges: [{ sourceKey: "api", targetKey: "db", label: "reads & writes" }],
  },
  task_graph: [
    { task_id: "t1", description: "Build API", acceptance_criteria: "Responds 200", depends_on: [] },
  ],
  decision_log_ids: ["22222222-2222-4222-8222-222222222222"],
  frozen_at: "2026-07-10T00:00:00.000Z",
};

describe("Fork A renderers", () => {
  it("renders requirements markdown with scope and assumptions", () => {
    const md = renderRequirementsMd(artifact);
    expect(md).toContain("# Requirements Document");
    expect(md).toContain("Assumed & flagged");
    expect(md).toContain("Out of scope");
  });

  it("renders architecture markdown with components and flows", () => {
    const md = renderArchitectureMd(artifact, []);
    expect(md).toContain("API <server>");
    expect(md).toContain("`api` → `db`");
  });

  it("renders the task graph", () => {
    const md = renderTaskGraphMd(artifact);
    expect(md).toContain("### t1");
    expect(md).toContain("Responds 200");
  });

  it("renders SVG with XML-escaped labels and both non-task nodes", () => {
    const svg = renderDiagramSvg(artifact);
    expect(svg).toContain("<svg");
    expect(svg).toContain("API &lt;server&gt;");
    expect(svg).toContain("Postgres");
    // Task nodes stay out of the diagram.
    expect(svg).not.toContain("Build API");
    expect(svg).toContain("marker-end");
  });
});
