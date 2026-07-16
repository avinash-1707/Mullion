import type { McqRound } from "@mullion/schemas";
import { QuestionRoundRecap } from "./question-round-card";

interface RequirementsHistoryPanelProps {
  idea: string;
  answeredRounds: McqRound[];
}

// Side pane (DecisionLogPanel's slot, 01 §2-3) — the running record for this
// phase: the idea itself pinned at top, then every round already answered,
// oldest first. Same shell as DecisionLogPanel (border border-border bg-bg,
// shrink-0 header + its own scroll) so the two phases' side panes read as
// one family, even though there's no decision log yet at this stage of a
// build.
export function RequirementsHistoryPanel({ idea, answeredRounds }: RequirementsHistoryPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
      <div className="shrink-0 border-b border-border p-3">
        {/* Dashed treatment carried over from the old single-column layout's
            idea recap, tightened for this narrower rail. */}
        <div className="border border-dashed border-border-strong px-3.5 py-3">
          <span className="font-mono text-xs uppercase tracking-[0.15em] text-fg-faint">Your idea</span>
          <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-fg-muted">{idea}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {answeredRounds.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-faint">Answered questions will appear here.</p>
        ) : (
          answeredRounds.map((round) => <QuestionRoundRecap key={round.id} round={round} />)
        )}
      </div>
    </div>
  );
}
