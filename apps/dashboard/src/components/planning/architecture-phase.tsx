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
  userName: string;
  userImage: string | null;
  clarifications: ClarificationLogEntry[];
  consistency: ConsistencyResult | null;
  graphVersion: number;
  agentState: AgentState;
  agentActor: string | null;
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
// lockstep, with a persistent consistency/confirm toolbar and the edit
// surface pinned under the decision log. Desktop: side-by-side split.
// Mobile: tabbed, diagram-first; the edit bar lives in the log tab.
export function ArchitecturePhase({
  nodes,
  edges,
  decisions,
  userName,
  userImage,
  clarifications,
  consistency,
  graphVersion,
  agentState,
  agentActor,
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
  if (!isCreator) editDisabledMessage = "View only - created by someone else in your org.";
  else if (agentState === "error") editDisabledMessage = "Resolve the error above before sending another edit.";
  else if (agentState === "working") editDisabledMessage = "The agent is working - one moment…";

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
              "transition-swift flex-1 border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em]",
              activeTab === tab ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {tab === "diagram" ? "Diagram" : "Decision log"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:overflow-hidden">
        <div className={`min-h-[22rem] flex-1 lg:min-h-0 ${activeTab === "diagram" ? "" : "hidden lg:block"}`}>
          <ArchitectureDiagram
            nodes={nodes}
            edges={edges}
            issues={consistency?.issues ?? []}
            agentState={agentState}
            agentActor={agentActor}
            refitToken={diagramShowCount}
          />
        </div>
        <div
          className={`min-h-[18rem] flex-1 flex-col gap-3 lg:min-h-0 lg:w-[23rem] lg:flex-none ${activeTab === "log" ? "flex" : "hidden lg:flex"}`}
        >
          <div className="min-h-0 flex-1">
            <DecisionLogPanel
              decisions={decisions}
              clarifications={clarifications}
              userName={userName}
              userImage={userImage}
              isCreator={isCreator}
              agentBusy={agentState === "working"}
              onChooseClarificationOption={handleChooseClarificationOption}
            />
          </div>
          {/* Pinned below the log, in its own row — never overlapping entries. */}
          <div className="shrink-0">
            <EditPromptBar
              disabled={editDisabledMessage !== null}
              disabledMessage={editDisabledMessage}
              isSubmitting={isSubmittingEdit}
              onSubmit={submitEdit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
