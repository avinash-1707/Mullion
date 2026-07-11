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
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BuildTask } from "@mullion/schemas";
import { layoutGraph } from "../../lib/graph-layout";
import { buildTaskDependencyLinks, buildTaskDisplayId, buildTaskNodeKey } from "../../lib/build-graph-mapping";
import type { BuildGraphFlowNode } from "../../lib/build-graph-flow-types";
import { BuildTaskNodeCard } from "./build-task-node-card";
import { useReducedMotion } from "../../hooks/use-reduced-motion";

const nodeTypes = { buildTaskNode: BuildTaskNodeCard };

const BOX_WIDTH = 224;
const BOX_HEIGHT = 112;

interface BuildAgentGraphProps {
  tasks: BuildTask[];
  // The run's timeline.activeEscalation?.specTaskId — the one node (if any)
  // that gets the "needs decision" treatment instead of its routine status
  // tone (ADR-07: an escalation reads as an interruption, not normal flow).
  escalatedSpecTaskId?: string | null;
  // See architecture-diagram.tsx's FitViewOnChange — same hidden-tab remount
  // problem (a pane can mount at 0×0 while CSS-hidden), same fix: the parent
  // bumps this when the pane becomes visible.
  refitToken?: number;
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

export function BuildAgentGraph({ tasks, escalatedSpecTaskId = null, refitToken = 0 }: BuildAgentGraphProps) {
  const links = useMemo(() => buildTaskDependencyLinks(tasks), [tasks]);

  const positions = useMemo(() => {
    const boxes = tasks.map((task) => ({ key: buildTaskNodeKey(task), width: BOX_WIDTH, height: BOX_HEIGHT }));
    return layoutGraph(boxes, links);
  }, [tasks, links]);

  const flowNodes: BuildGraphFlowNode[] = useMemo(
    () =>
      tasks.map((task) => {
        const key = buildTaskNodeKey(task);
        return {
          id: key,
          type: "buildTaskNode",
          position: positions.get(key) ?? { x: 0, y: 0 },
          draggable: false,
          data: {
            displayId: buildTaskDisplayId(task),
            description: task.description,
            status: task.status,
            attempt: task.attempt,
            isEscalated: task.specTaskId !== null && task.specTaskId === escalatedSpecTaskId,
          },
        };
      }),
    [tasks, positions, escalatedSpecTaskId],
  );

  const statusByKey = useMemo(() => {
    const map = new Map<string, BuildTask["status"]>();
    for (const task of tasks) map.set(buildTaskNodeKey(task), task.status);
    return map;
  }, [tasks]);

  const flowEdges: Edge[] = useMemo(
    () =>
      links.map((link) => {
        // Animation follows the target's own status, independent of the
        // escalation overlay above — the edge reflects DAG execution state,
        // not whether that task is currently stuck at a human gate.
        const targetRunning = statusByKey.get(link.targetKey) === "running";
        return {
          id: `${link.sourceKey}->${link.targetKey}`,
          source: link.sourceKey,
          target: link.targetKey,
          animated: targetRunning,
          style: { opacity: targetRunning ? 0.9 : 0.55 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: targetRunning ? "var(--color-accent)" : "var(--color-border-strong)",
          },
        };
      }),
    [links, statusByKey],
  );

  const signature = `${flowNodes.map((n) => n.id).sort().join(",")}::${refitToken}`;

  return (
    <div className="mullion-flow relative h-full min-h-[20rem] w-full overflow-hidden border border-border bg-bg">
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
      {tasks.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-fg-faint">Waiting for tasks…</p>
        </div>
      ) : null}
    </div>
  );
}
