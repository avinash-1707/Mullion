import type { AgentState } from "@mullion/schemas";
import { Button } from "../ui/button";
import { WarningIcon } from "./icons";

interface AgentStatusStripProps {
  agentState: AgentState;
  agentError: string | null;
  actor: string | null;
  isCreator: boolean;
  onRetry: () => void;
  isRetrying: boolean;
}

function actorLabel(actor: string | null): string {
  if (!actor) return "The agent";
  return actor.charAt(0).toUpperCase() + actor.slice(1);
}

// One shared status surface for both phases (01 §4.5 / 02 §2.4): Phase 2 is
// human-attended, so failure handling is a manual "try again," never a
// retry-budget counter. Idle renders nothing — an always-present "all good"
// banner would just be permanent visual noise (Emil: no motion/UI without a
// purpose).
export function AgentStatusStrip({ agentState, agentError, actor, isCreator, onRetry, isRetrying }: AgentStatusStripProps) {
  if (agentState === "idle") return null;

  if (agentState === "working") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5 sm:px-6">
        <span className="h-1.5 w-1.5 shrink-0 bg-accent" aria-hidden="true" />
        <p className="text-xs text-fg-muted">{actorLabel(actor)} is working…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-danger/30 bg-danger-soft px-4 py-3 sm:px-6">
      <div className="flex items-start gap-2.5">
        <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div>
          <p className="text-sm font-medium text-danger">{actorLabel(actor)} hit an error</p>
          <p className="mt-0.5 text-xs text-danger/85">{agentError ?? "An unexpected error occurred."}</p>
        </div>
      </div>
      {isCreator ? (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={isRetrying} className="border-danger/40 text-danger hover:border-danger hover:text-danger">
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
      ) : (
        <span className="text-xs text-danger/70">View only — waiting on the creator</span>
      )}
    </div>
  );
}
