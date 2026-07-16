"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ConsistencyIssue, GraphEdge, GraphNode } from "@mullion/schemas";
import { layoutGraph, type LayoutLink } from "../../lib/graph-layout";
import type { GraphFlowEdge, GraphFlowNode } from "../../lib/graph-flow-types";
import { GraphNodeCard } from "./graph-node-card";
import { useReducedMotion } from "../../hooks/use-reduced-motion";

const nodeTypes = { graphNode: GraphNodeCard };

const BOX = { service: [240, 100], datastore: [240, 100], external: [240, 100], task: [180, 76] } as const;

// The two panes of the diagram: architecture nodes (service/datastore/
// external + their edges) and the task graph (task nodes + dependency
// links). Edges crossing the divide are hidden on both panes rather than
// drawn to a missing node.
type DiagramPane = "architecture" | "tasks";

const PANES: { key: DiagramPane; label: string }[] = [
  { key: "architecture", label: "Architecture" },
  { key: "tasks", label: "Tasks" },
];

interface ArchitectureDiagramProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  issues: ConsistencyIssue[];
  // Bumped by the parent whenever this pane transitions from hidden to
  // visible (mobile tab switch) — the pane can mount while `display: none`
  // (both tabs stay in the DOM so state isn't lost switching back and
  // forth), and fitView against a 0×0 container produces a degenerate
  // viewport that never self-corrects on its own. Forces one more fit once
  // real dimensions exist.
  refitToken?: number;
}

function buildSynthesizedLinks(nodes: GraphNode[], explicit: GraphEdge[]): LayoutLink[] {
  const explicitPairs = new Set(explicit.map((e) => `${e.sourceKey}->${e.targetKey}`));
  const synthesized: LayoutLink[] = [];
  for (const node of nodes) {
    if (node.kind !== "task") continue;
    for (const dep of node.dependsOn) {
      const pair = `${dep}->${node.nodeKey}`;
      if (explicitPairs.has(pair)) continue;
      synthesized.push({ sourceKey: dep, targetKey: node.nodeKey });
    }
  }
  return synthesized;
}

function FitViewOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.3, maxZoom: 1, duration: reducedMotion ? 0 : 400 });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}

export function ArchitectureDiagram({ nodes, edges, issues, refitToken = 0 }: ArchitectureDiagramProps) {
  const [activePane, setActivePane] = useState<DiagramPane>("architecture");

  const flaggedKeys = useMemo(() => new Set(issues.flatMap((issue) => issue.nodeKeys)), [issues]);

  const synthesizedLinks = useMemo(() => buildSynthesizedLinks(nodes, edges), [nodes, edges]);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => (n.kind === "task") === (activePane === "tasks")),
    [nodes, activePane],
  );
  const visibleKeys = useMemo(() => new Set(visibleNodes.map((n) => n.nodeKey)), [visibleNodes]);

  const positions = useMemo(() => {
    const boxes = visibleNodes.map((n) => {
      const [width, height] = BOX[n.kind];
      return { key: n.nodeKey, width, height };
    });
    const links: LayoutLink[] = [
      ...edges.map((e) => ({ sourceKey: e.sourceKey, targetKey: e.targetKey })),
      ...synthesizedLinks,
    ];
    // layoutGraph drops links whose endpoints aren't registered, so links
    // crossing into the other pane fall away without pre-filtering.
    return layoutGraph(boxes, links);
  }, [visibleNodes, edges, synthesizedLinks]);

  const flowNodes: GraphFlowNode[] = useMemo(
    () =>
      visibleNodes.map((node) => ({
        id: node.nodeKey,
        type: "graphNode",
        position: positions.get(node.nodeKey) ?? { x: 0, y: 0 },
        draggable: false,
        data: {
          label: node.label,
          description: node.description,
          kind: node.kind,
          status: node.status,
          revision: node.revision,
          flagged: flaggedKeys.has(node.nodeKey),
        },
      })),
    [visibleNodes, positions, flaggedKeys],
  );

  const flowEdges: GraphFlowEdge[] = useMemo(() => {
    const visible = edges.filter((e) => visibleKeys.has(e.sourceKey) && visibleKeys.has(e.targetKey));
    const explicit: GraphFlowEdge[] = visible.map((edge) => ({
      id: edge.id,
      source: edge.sourceKey,
      target: edge.targetKey,
      label: edge.label,
      animated: false,
      style: { opacity: edge.status === "removed" ? 0.35 : 0.9, strokeDasharray: edge.status === "removed" ? "4 4" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--color-fg-faint)" },
      data: { synthesized: false, status: edge.status },
    }));
    const synthesized: GraphFlowEdge[] = synthesizedLinks
      .filter((link) => visibleKeys.has(link.sourceKey) && visibleKeys.has(link.targetKey))
      .map((link) => ({
        id: `dep::${link.sourceKey}::${link.targetKey}`,
        source: link.sourceKey,
        target: link.targetKey,
        style: { opacity: 0.55, strokeDasharray: "3 5" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--color-fg-faint)" },
        data: { synthesized: true, status: "active" },
      }));
    return [...explicit, ...synthesized];
  }, [edges, synthesizedLinks, visibleKeys]);

  const signature = `${flowNodes.map((n) => n.id).sort().join(",")}::${activePane}::${refitToken}`;

  return (
    <div className="mullion-flow relative h-full min-h-[20rem] w-full overflow-hidden border border-border bg-bg lg:min-h-0">
      <div className="absolute left-3 top-3 z-10 flex border border-border bg-surface shadow-[0_8px_20px_-12px_rgba(0,0,0,0.55)]">
        {PANES.map((pane) => (
          <button
            key={pane.key}
            type="button"
            onClick={() => setActivePane(pane.key)}
            aria-pressed={activePane === pane.key}
            className={[
              "transition-swift px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em]",
              activePane === pane.key ? "bg-elevated text-fg" : "text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {pane.label}
          </button>
        ))}
      </div>
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          fitView
          // Fit slightly zoomed out (never past 1:1) so node details read
          // without edges/cards pressed against the pane borders.
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--color-border)" />
          <Controls showInteractive={false} />
          <FitViewOnChange signature={signature} />
        </ReactFlow>
      </ReactFlowProvider>
      {visibleNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-fg-faint">
            {nodes.length === 0
              ? "Waiting for the first decision…"
              : activePane === "tasks"
                ? "No tasks yet."
                : "No architecture nodes yet."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
