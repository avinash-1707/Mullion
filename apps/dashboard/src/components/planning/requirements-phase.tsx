"use client";

import { useState } from "react";
import type { AgentState, McqAnswer, McqRound, RequirementsDocVersion } from "@mullion/schemas";
import { QuestionRoundCard, QuestionRoundRecap } from "./question-round-card";
import { RequirementsDocumentCard } from "./requirements-document-card";
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
  const sorted = [...rounds].sort((a, b) => a.round - b.round);
  const pendingRound = sorted.find((r) => r.answers === null);
  const answeredRounds = sorted.filter((r) => r.answers !== null);
  const disabled = agentState === "working" || !isCreator;

  function handleRoundSubmit(round: McqRound) {
    return (answers: McqAnswer[]) => {
      submitAnswers({ roundId: round.id, answers });
      setEditingAnswers(false);
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="border border-dashed border-border-strong px-5 py-4">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-fg-faint">Your idea</span>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{idea}</p>
      </div>

      {editingAnswers ? (
        <div className="flex flex-col gap-6">
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
      ) : (
        <>
          {sorted.length === 0 ? (
            <div className="border border-border bg-surface p-6 text-sm text-fg-muted">
              The analyst is reading your idea and drafting a first round of questions…
            </div>
          ) : null}

          {answeredRounds.map((round) => (
            <QuestionRoundRecap key={round.id} round={round} />
          ))}

          {pendingRound ? (
            isCreator ? (
              <QuestionRoundCard
                round={pendingRound}
                disabled={disabled}
                isSubmitting={isSubmittingAnswers}
                onSubmit={handleRoundSubmit(pendingRound)}
              />
            ) : (
              <QuestionRoundRecap round={pendingRound} />
            )
          ) : null}

          {!pendingRound && sorted.length > 0 && !requirements ? (
            <div className="border border-border bg-surface p-6 text-sm text-fg-muted">
              Drafting your requirements document from those answers…
            </div>
          ) : null}

          {requirements ? (
            <RequirementsDocumentCard
              doc={requirements.doc}
              version={requirements.version}
              isCreator={isCreator}
              disabled={agentState === "working"}
              isProceeding={isProceeding}
              onEditAnswers={() => setEditingAnswers(true)}
              onProceed={proceed}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
