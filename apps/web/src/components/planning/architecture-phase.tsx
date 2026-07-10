"use client";

import { useState } from "react";
import type { AgentState, ConsistencyResult, DecisionEntry, GraphEdge, GraphNode } from "@mullion/schemas";
import type { ClarificationLogEntry } from "../../lib/planning-reducer";
import type { ConfirmConflict } from "../../hooks/use-planning-session";
import { ArchitectureDiagram } from "./architecture-diagram";
import { DecisionLogPanel } from "./decision-log-panel";
import { ConsistencyPanel } from "./consistency-panel";
import { EditPromptBar } from "./edit-prompt-bar";

interface ArchitecturePhaseProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  decisions: DecisionEntry[];
  clarifications: ClarificationLogEntry[];
  consistency: ConsistencyResult | null;
  graphVersion: number;
  agentState: AgentState;
  isCreator: boolean;
  submitEdit: (prompt: string) => void;
  isSubmittingEdit: boolean;
  confirm: () => void;
  isConfirming: boolean;
  confirmConflict: ConfirmConflict | null;
  clearConfirmConflict: () => void;
  markClarificationAnswered: (questionId: string) => void;
}

// Phase 2 (01 §4) — the centerpiece: live diagram + decision log, kept in
// lockstep, with a persistent consistency/confirm toolbar and one always-
// reachable edit surface. Desktop: side-by-side split. Mobile: tabbed,
// diagram-first, edit bar always visible regardless of which tab is active.
export function ArchitecturePhase({
  nodes,
  edges,
  decisions,
  clarifications,
  consistency,
  graphVersion,
  agentState,
  isCreator,
  submitEdit,
  isSubmittingEdit,
  confirm,
  isConfirming,
  confirmConflict,
  clearConfirmConflict,
  markClarificationAnswered,
}: ArchitecturePhaseProps) {
  const [activeTab, setActiveTab] = useState<"diagram" | "log">("diagram");
  // See ArchitectureDiagram's refitToken doc — bumped each time the mobile
  // tab switches back to "diagram" so its fitView re-runs against the pane's
  // real (now-visible) dimensions instead of the 0×0 box it had while hidden.
  const [diagramShowCount, setDiagramShowCount] = useState(0);

  function selectTab(tab: "diagram" | "log") {
    setActiveTab(tab);
    if (tab === "diagram") setDiagramShowCount((count) => count + 1);
  }

  function handleChooseClarificationOption(entry: ClarificationLogEntry, option: string) {
    submitEdit(`Answer to "${entry.question.text}": ${option}`);
    markClarificationAnswered(entry.id);
  }

  let editDisabledMessage: string | null = null;
  if (!isCreator) editDisabledMessage = "View only — created by someone else in your org.";
  else if (agentState === "error") editDisabledMessage = "Resolve the error above before sending another edit.";
  else if (agentState === "working") editDisabledMessage = "The agent is working — one moment…";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <ConsistencyPanel
          consistency={consistency}
          graphVersion={graphVersion}
          agentState={agentState}
          isCreator={isCreator}
          onConfirm={confirm}
          isConfirming={isConfirming}
          confirmConflict={confirmConflict}
          onDismissConflict={clearConfirmConflict}
        />
      </div>

      <div className="flex border-b border-border lg:hidden">
        {(["diagram", "log"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => selectTab(tab)}
            className={[
              "transition-swift flex-1 border-b-2 px-4 py-2.5 text-sm font-medium",
              activeTab === tab ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {tab === "diagram" ? "Diagram" : "Decision log"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <div className={`min-h-[22rem] flex-1 ${activeTab === "diagram" ? "" : "hidden lg:block"}`}>
          <ArchitectureDiagram nodes={nodes} edges={edges} issues={consistency?.issues ?? []} refitToken={diagramShowCount} />
        </div>
        <div className={`min-h-[18rem] lg:w-[23rem] lg:shrink-0 ${activeTab === "log" ? "" : "hidden lg:block"}`}>
          <DecisionLogPanel
            decisions={decisions}
            clarifications={clarifications}
            isCreator={isCreator}
            agentBusy={agentState === "working"}
            onChooseClarificationOption={handleChooseClarificationOption}
          />
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg/95 p-4 backdrop-blur-sm sm:px-6">
        <EditPromptBar
          disabled={editDisabledMessage !== null}
          disabledMessage={editDisabledMessage}
          isSubmitting={isSubmittingEdit}
          onSubmit={submitEdit}
        />
      </div>
    </div>
  );
}
