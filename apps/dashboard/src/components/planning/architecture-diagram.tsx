"use client";

import { useEffect, useMemo } from "react";
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
      fitView({ padding: 0.2, duration: reducedMotion ? 0 : 400 });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}

export function ArchitectureDiagram({ nodes, edges, issues, refitToken = 0 }: ArchitectureDiagramProps) {
  const flaggedKeys = useMemo(() => new Set(issues.flatMap((issue) => issue.nodeKeys)), [issues]);

  const synthesizedLinks = useMemo(() => buildSynthesizedLinks(nodes, edges), [nodes, edges]);

  const positions = useMemo(() => {
    const boxes = nodes.map((n) => {
      const [width, height] = BOX[n.kind];
      return { key: n.nodeKey, width, height };
    });
    const links: LayoutLink[] = [
      ...edges.map((e) => ({ sourceKey: e.sourceKey, targetKey: e.targetKey })),
      ...synthesizedLinks,
    ];
    return layoutGraph(boxes, links);
  }, [nodes, edges, synthesizedLinks]);

  const flowNodes: GraphFlowNode[] = useMemo(
    () =>
      nodes.map((node) => ({
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
    [nodes, positions, flaggedKeys],
  );

  const flowEdges: GraphFlowEdge[] = useMemo(() => {
    const explicit: GraphFlowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceKey,
      target: edge.targetKey,
      label: edge.label,
      animated: false,
      style: { opacity: edge.status === "removed" ? 0.35 : 0.9, strokeDasharray: edge.status === "removed" ? "4 4" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--color-fg-faint)" },
      data: { synthesized: false, status: edge.status },
    }));
    const synthesized: GraphFlowEdge[] = synthesizedLinks.map((link) => ({
      id: `dep::${link.sourceKey}::${link.targetKey}`,
      source: link.sourceKey,
      target: link.targetKey,
      style: { opacity: 0.55, strokeDasharray: "3 5" },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--color-fg-faint)" },
      data: { synthesized: true, status: "active" },
    }));
    return [...explicit, ...synthesized];
  }, [edges, synthesizedLinks]);

  const signature = `${flowNodes.map((n) => n.id).sort().join(",")}::${refitToken}`;

  return (
    <div className="mullion-flow relative h-full min-h-[20rem] w-full overflow-hidden border border-border bg-bg lg:min-h-0">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          fitView
          minZoom={0.2}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--color-border)" />
          <Controls showInteractive={false} />
          <FitViewOnChange signature={signature} />
        </ReactFlow>
      </ReactFlowProvider>
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-fg-faint">Waiting for the first decision…</p>
        </div>
      ) : null}
    </div>
  );
}
