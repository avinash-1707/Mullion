"use client";

import { useState } from "react";
import type { AgentState, McqAnswer, McqRound, RequirementsDocVersion } from "@mullion/schemas";
import { QuestionRoundCard, QuestionRoundRecap } from "./question-round-card";
import { RequirementsDocumentCard } from "./requirements-document-card";
import { RequirementsHistoryPanel } from "./requirements-history-panel";
import { AnalystStatusStrip } from "./analyst-status-strip";
import { AgentWorkingPanel } from "./agent-working-panel";
import { Button } from "../ui/button";

interface RequirementsPhaseProps {
  idea: string;
  rounds: McqRound[];
  requirements: RequirementsDocVersion | null;
  agentState: AgentState;
  isCreator: boolean;
  submitAnswers: (input: { roundId: string; answers: McqAnswer[] }) => void;
  isSubmittingAnswers: boolean;
  proceed: () => void;
  isProceeding: boolean;
}

// Phase 1 (01 §2-3) — the analyst's clarification loop, sharing
// ArchitecturePhase's two-pane, viewport-capped chrome (top strip / mobile
// tab row / main+side split) class-for-class, so the two phases render one
// shape and one skeleton fits either regardless of which one a reload lands
// on (see session-skeletons.tsx and sessions/[id]/page.tsx, which used to
// guess from a `?phase=` URL hint that a plain reload never carries). Main
// pane holds whatever's actionable right now — the working loader, the
// pending round, or the drafted doc (and its "edit answers" detour); side
// pane is the running record: the idea plus every round already answered.
export function RequirementsPhase({
  idea,
  rounds,
  requirements,
  agentState,
  isCreator,
  submitAnswers,
  isSubmittingAnswers,
  proceed,
  isProceeding,
}: RequirementsPhaseProps) {
  const [editingAnswers, setEditingAnswers] = useState(false);
  const [activeTab, setActiveTab] = useState<"analyst" | "answers">("analyst");

  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const pendingRound = sorted.find((r) => r.answers === null) ?? null;
  const answeredRounds = sorted.filter((r) => r.answers !== null);
  const disabled = agentState === "working" || !isCreator;

  function handleRoundSubmit(round: McqRound) {
    return (answers: McqAnswer[]) => {
      submitAnswers({ roundId: round.id, answers });
      setEditingAnswers(false);
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <AnalystStatusStrip
          hasRounds={sorted.length > 0}
          pendingRoundNumber={pendingRound?.round ?? null}
          hasRequirements={requirements !== null}
        />
      </div>

      <div className="flex border-b border-border lg:hidden">
        {(["analyst", "answers"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              "transition-swift flex-1 border-b-2 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em]",
              activeTab === tab ? "border-accent text-fg" : "border-transparent text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {tab === "analyst" ? "Analyst" : "Answers"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:overflow-hidden">
        <div className={`min-h-[22rem] flex-1 lg:min-h-0 ${activeTab === "analyst" ? "" : "hidden lg:block"}`}>
          {/* This pane's own scroll region — a long question card or a
              lengthy requirements doc scrolls in place instead of pushing
              the outer body around. */}
          <div className="h-full min-h-0 overflow-y-auto">
            {editingAnswers ? (
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                {answeredRounds.map((round) => (
                  <QuestionRoundCard
                    key={round.id}
                    round={round}
                    disabled={disabled}
                    isSubmitting={isSubmittingAnswers}
                    submitLabel="Save changes"
                    onSubmit={handleRoundSubmit(round)}
                  />
                ))}
                <div className="flex justify-start">
                  <Button variant="ghost" size="sm" onClick={() => setEditingAnswers(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : pendingRound ? (
              <div className="mx-auto w-full max-w-2xl">
                {isCreator ? (
                  <QuestionRoundCard
                    round={pendingRound}
                    disabled={disabled}
                    isSubmitting={isSubmittingAnswers}
                    onSubmit={handleRoundSubmit(pendingRound)}
                  />
                ) : (
                  <QuestionRoundRecap round={pendingRound} />
                )}
              </div>
            ) : requirements ? (
              <div className="mx-auto w-full max-w-2xl">
                <RequirementsDocumentCard
                  doc={requirements.doc}
                  version={requirements.version}
                  isCreator={isCreator}
                  disabled={agentState === "working"}
                  isProceeding={isProceeding}
                  onEditAnswers={() => setEditingAnswers(true)}
                  onProceed={proceed}
                />
              </div>
            ) : (
              <AgentWorkingPanel label={sorted.length === 0 ? "Reading your idea" : "Drafting requirements"} />
            )}
          </div>
        </div>

        <div
          className={`min-h-[18rem] flex-1 flex-col gap-3 lg:min-h-0 lg:w-[23rem] lg:flex-none ${activeTab === "answers" ? "flex" : "hidden lg:flex"}`}
        >
          <div className="min-h-0 flex-1">
            <RequirementsHistoryPanel idea={idea} answeredRounds={answeredRounds} />
          </div>
        </div>
      </div>
    </div>
  );
}
