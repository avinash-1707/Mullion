"use client";

import { useEffect, useRef, useState } from "react";
import type { DecisionEntry } from "@mullion/schemas";
import type { ClarificationLogEntry } from "../../lib/planning-reducer";
import { useReducedMotion } from "../../hooks/use-reduced-motion";
import { PersonIcon, SparkIcon } from "./icons";

type LogItem =
  | { kind: "decision"; createdAt: string; entry: DecisionEntry }
  | { kind: "clarification"; createdAt: string; entry: ClarificationLogEntry };

interface DecisionLogPanelProps {
  decisions: DecisionEntry[];
  clarifications: ClarificationLogEntry[];
  isCreator: boolean;
  agentBusy: boolean;
  onChooseClarificationOption: (entry: ClarificationLogEntry, option: string) => void;
}

function ActorChip({ actor }: { actor: string }) {
  const isUser = actor === "user";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.15em]",
        isUser ? "border-accent/40 text-accent-strong" : "border-border-strong text-fg-muted",
      ].join(" ")}
    >
      {isUser ? <PersonIcon className="h-3 w-3" /> : <SparkIcon className="h-3 w-3" />}
      {actor.charAt(0).toUpperCase() + actor.slice(1)}
    </span>
  );
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function DecisionRow({ entry }: { entry: DecisionEntry }) {
  return (
    <div className="animate-reveal flex flex-col gap-1.5 border-b border-hairline pb-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <ActorChip actor={entry.actor} />
        <span className="font-mono text-[11px] text-fg-faint">{timeLabel(entry.createdAt)}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-fg">{entry.decision}</p>
      {entry.rationale ? <p className="text-xs leading-relaxed text-fg-muted">{entry.rationale}</p> : null}
      {entry.alternativesConsidered ? (
        <details className="group mt-0.5">
          <summary className="transition-swift cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint hover:text-fg-muted">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Alternatives considered
          </summary>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{entry.alternativesConsidered}</p>
        </details>
      ) : null}
    </div>
  );
}

function ClarificationRow({
  entry,
  isCreator,
  agentBusy,
  onChoose,
}: {
  entry: ClarificationLogEntry;
  isCreator: boolean;
  agentBusy: boolean;
  onChoose: (option: string) => void;
}) {
  return (
    <div className="animate-reveal flex flex-col gap-2 border border-accent/30 bg-accent-soft p-4">
      <div className="flex items-center justify-between gap-2">
        <ActorChip actor="planner" />
        <span className="font-mono text-[11px] text-fg-faint">{timeLabel(entry.createdAt)}</span>
      </div>
      <p className="text-sm leading-snug text-fg">{entry.statement}</p>
      <p className="text-sm font-medium text-fg">{entry.question.text}</p>
      <div className="flex flex-wrap gap-2">
        {entry.question.options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!isCreator || agentBusy || entry.answered}
            onClick={() => onChoose(option)}
            className="transition-swift border border-accent/40 bg-bg/40 px-3 py-1.5 text-xs font-medium text-fg hover:border-accent hover:text-accent-strong disabled:pointer-events-none disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
      {entry.answered ? <p className="text-[11px] text-accent-strong">Answered - waiting on the agent.</p> : null}
    </div>
  );
}

// The decision log (01 §4.1) — the same structured rows the backend keeps as
// the system's design memory, merged chronologically with any planner
// clarification pushback so the two never drift into separate timelines.
export function DecisionLogPanel({ decisions, clarifications, isCreator, agentBusy, onChooseClarificationOption }: DecisionLogPanelProps) {
  const items: LogItem[] = [
    ...decisions.map((entry): LogItem => ({ kind: "decision", createdAt: entry.createdAt, entry })),
    ...clarifications.map((entry): LogItem => ({ kind: "clarification", createdAt: entry.createdAt, entry })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom) return;
    // CSS's global reduced-motion override (globals.css) can't intercept an
    // explicit JS `behavior` option — smooth-scroll here has to check
    // prefers-reduced-motion itself rather than relying on that cascade.
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? "instant" : "smooth" });
  }, [items.length, stickToBottom, reducedMotion]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom < 48);
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="font-serif text-lg text-fg">Decision log</h2>
        <p className="text-xs text-fg-faint">Every choice, with why - never silent.</p>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-faint">Decisions will appear here as the agent plans.</p>
        ) : (
          items.map((item) =>
            item.kind === "decision" ? (
              <DecisionRow key={item.entry.id} entry={item.entry} />
            ) : (
              <ClarificationRow
                key={item.entry.id}
                entry={item.entry}
                isCreator={isCreator}
                agentBusy={agentBusy}
                onChoose={(option) => onChooseClarificationOption(item.entry, option)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}
