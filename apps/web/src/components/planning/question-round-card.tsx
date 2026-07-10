"use client";

import { useMemo, useState } from "react";
import type { McqAnswer, McqQuestion, McqRound } from "@mullion/schemas";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { CheckIcon } from "./icons";

interface QuestionDraft {
  selected: Set<string>;
  otherActive: boolean;
  otherText: string;
}

function draftFromAnswer(question: McqQuestion, answer: McqAnswer | undefined): QuestionDraft {
  if (!answer) return { selected: new Set(), otherActive: false, otherText: "" };
  return {
    selected: new Set(answer.selectedOptions),
    otherActive: Boolean(answer.otherText && answer.otherText.trim().length > 0),
    otherText: answer.otherText ?? "",
  };
}

function isDraftValid(question: McqQuestion, draft: QuestionDraft): boolean {
  const hasOther = draft.otherActive && draft.otherText.trim().length > 0;
  if (question.type === "single_select") {
    return (draft.selected.size === 1 && !draft.otherActive) || (draft.selected.size === 0 && hasOther);
  }
  return draft.selected.size > 0 || hasOther;
}

function chipClass(selected: boolean): string {
  return [
    "transition-swift rounded-full border px-4 py-2 text-left text-sm font-medium",
    "active:scale-[0.97] focus-visible:outline-none",
    selected
      ? "border-accent bg-accent-soft text-accent-strong"
      : "border-border-strong text-fg-muted hover:border-fg-faint hover:text-fg",
  ].join(" ");
}

interface QuestionEditorProps {
  question: McqQuestion;
  draft: QuestionDraft;
  disabled: boolean;
  onChange: (next: QuestionDraft) => void;
}

function QuestionEditor({ question, draft, disabled, onChange }: QuestionEditorProps) {
  function selectOption(option: string) {
    if (disabled) return;
    if (question.type === "single_select") {
      onChange({ selected: new Set([option]), otherActive: false, otherText: draft.otherText });
      return;
    }
    const next = new Set(draft.selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange({ ...draft, selected: next });
  }

  function selectOther() {
    if (disabled) return;
    if (question.type === "single_select") {
      onChange({ selected: new Set(), otherActive: true, otherText: draft.otherText });
      return;
    }
    onChange({ ...draft, otherActive: !draft.otherActive });
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="text-[15px] font-medium leading-snug text-fg">{question.text}</legend>
      <div className="flex flex-wrap gap-2" role={question.type === "single_select" ? "radiogroup" : "group"}>
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            role={question.type === "single_select" ? "radio" : undefined}
            aria-checked={question.type === "single_select" ? draft.selected.has(option) : undefined}
            aria-pressed={question.type === "multi_select" ? draft.selected.has(option) : undefined}
            onClick={() => selectOption(option)}
            className={chipClass(draft.selected.has(option))}
          >
            {draft.selected.has(option) ? <CheckIcon className="mr-1.5 -mt-0.5 inline h-3.5 w-3.5" /> : null}
            {option}
          </button>
        ))}
        <button type="button" onClick={selectOther} className={chipClass(draft.otherActive)}>
          Other (type your own)
        </button>
      </div>
      {draft.otherActive ? (
        <Textarea
          fieldId={`other-${question.id}`}
          rows={2}
          placeholder="Type your own answer…"
          value={draft.otherText}
          onChange={(event) => onChange({ ...draft, otherText: event.target.value })}
          disabled={disabled}
          className="w-full"
        />
      ) : null}
    </fieldset>
  );
}

interface QuestionRoundRecapProps {
  round: McqRound;
}

// Static recap for an already-answered round — no interactive controls, just
// what was chosen. Used for earlier rounds once the user has moved on, and
// for non-creators viewing someone else's session.
export function QuestionRoundRecap({ round }: QuestionRoundRecapProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-fg-faint">Round {round.round}</span>
        <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
          {round.answers === null ? "Awaiting answer" : "Answered"}
        </span>
      </div>
      {round.questions.map((question) => {
        const answer = round.answers?.find((a) => a.questionId === question.id);
        return (
          <div key={question.id} className="flex flex-col gap-1.5">
            <p className="text-sm text-fg-muted">{question.text}</p>
            <p className="text-sm font-medium text-fg">
              {answer
                ? [...answer.selectedOptions, ...(answer.otherText ? [answer.otherText] : [])].join(", ")
                : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

interface QuestionRoundCardProps {
  round: McqRound;
  disabled: boolean;
  isSubmitting: boolean;
  submitLabel?: string;
  onSubmit: (answers: McqAnswer[]) => void;
}

// The interactive form for the round currently awaiting answers (01 §3):
// every question is MCQ with an "Other" escape hatch, never a dead end.
export function QuestionRoundCard({ round, disabled, isSubmitting, submitLabel = "Continue", onSubmit }: QuestionRoundCardProps) {
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>(() => {
    const initial: Record<string, QuestionDraft> = {};
    for (const question of round.questions) {
      initial[question.id] = draftFromAnswer(question, round.answers?.find((a) => a.questionId === question.id));
    }
    return initial;
  });

  const allValid = useMemo(
    () => round.questions.every((q) => isDraftValid(q, drafts[q.id] ?? { selected: new Set(), otherActive: false, otherText: "" })),
    [round.questions, drafts],
  );

  function handleSubmit() {
    if (!allValid) return;
    const answers: McqAnswer[] = round.questions.map((question) => {
      const draft = drafts[question.id] ?? { selected: new Set<string>(), otherActive: false, otherText: "" };
      return {
        questionId: question.id,
        selectedOptions: Array.from(draft.selected),
        otherText: draft.otherActive ? draft.otherText.trim() : undefined,
      };
    });
    onSubmit(answers);
  }

  return (
    <div className="animate-reveal flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-fg-faint">
        Round {round.round} of 2
      </span>
      {round.questions.map((question) => (
        <QuestionEditor
          key={question.id}
          question={question}
          disabled={disabled}
          draft={drafts[question.id] ?? { selected: new Set(), otherActive: false, otherText: "" }}
          onChange={(next) => setDrafts((prev) => ({ ...prev, [question.id]: next }))}
        />
      ))}
      <div className="flex justify-end">
        <Button type="button" onClick={handleSubmit} disabled={disabled || !allValid || isSubmitting}>
          {isSubmitting ? "Recording…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
