import type { ReactNode } from "react";
import { CheckIcon, PersonIcon, SparkIcon } from "./icons";

interface AnalystStatusStripProps {
  hasRounds: boolean;
  pendingRoundNumber: number | null;
  hasRequirements: boolean;
}

// Top strip (ConsistencyPanel's slot, same shell/footprint) — keyed to this
// phase's own round/document progress, not agentState directly. That's
// deliberate: AgentStatusStrip (rendered by the page, above both phases)
// already owns the raw working/error signal; this strip's job is narrower —
// "where is the analyst in the round/document flow" — and stays visible even
// while AgentStatusStrip is idle (e.g. the brief pause between rounds).
export function AnalystStatusStrip({ hasRounds, pendingRoundNumber, hasRequirements }: AnalystStatusStripProps) {
  let icon: ReactNode;
  let text: string;

  if (hasRequirements) {
    icon = <CheckIcon className="h-4 w-4 shrink-0 text-accent" />;
    text = "Requirements ready - review below.";
  } else if (pendingRoundNumber !== null) {
    icon = <PersonIcon className="h-4 w-4 shrink-0 text-fg-muted" />;
    text = `Round ${pendingRoundNumber} - waiting for your answers.`;
  } else if (hasRounds) {
    icon = <SparkIcon className="h-4 w-4 shrink-0 text-accent" />;
    text = "Drafting your requirements document…";
  } else {
    icon = <SparkIcon className="h-4 w-4 shrink-0 text-accent" />;
    text = "The analyst is reading your idea…";
  }

  return (
    <div className="flex items-center gap-2 border border-border-strong bg-surface px-4 py-3.5">
      {icon}
      <p className="text-sm text-fg">{text}</p>
    </div>
  );
}
