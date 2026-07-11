"use client";

import { useState } from "react";
import type { AgentState, ConsistencyResult } from "@mullion/schemas";
import type { ConfirmConflict } from "../../hooks/use-planning-session";
import { Button } from "../ui/button";
import { CheckIcon, ChevronIcon, WarningIcon } from "./icons";

interface ConsistencyPanelProps {
  consistency: ConsistencyResult | null;
  graphVersion: number;
  agentState: AgentState;
  isCreator: boolean;
  onConfirm: () => void;
  isConfirming: boolean;
  confirmConflict: ConfirmConflict | null;
  onDismissConflict: () => void;
}

// The consistency gate before "Confirm Architecture" (01 §4.3) — blocks
// confirmation with a specific, listed reason, never an auto-resolve.
export function ConsistencyPanel({
  consistency,
  graphVersion,
  agentState,
  isCreator,
  onConfirm,
  isConfirming,
  confirmConflict,
  onDismissConflict,
}: ConsistencyPanelProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);

  const stale = consistency !== null && consistency.graphVersion !== graphVersion;
  const failing = consistency?.status === "fail";

  let helper: string;
  let canConfirm = false;
  if (agentState === "working") {
    helper = "The agent is still working — confirm unlocks once it settles.";
  } else if (agentState === "error") {
    helper = "Resolve the error above before confirming.";
  } else if (!consistency) {
    helper = "Waiting for the first consistency check…";
  } else if (stale) {
    helper = "Re-checking consistency after your latest change…";
  } else if (failing) {
    helper = "Resolve the issues below before confirming.";
  } else {
    helper = "Architecture is internally consistent.";
    canConfirm = true;
  }

  const showIssues = consistency && failing && !stale;

  return (
    <div className="flex flex-col gap-3 border border-border-strong bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {canConfirm ? (
            <CheckIcon className="h-4 w-4 shrink-0 text-accent" />
          ) : (
            <WarningIcon className={`h-4 w-4 shrink-0 ${showIssues ? "text-danger" : "text-fg-faint"}`} />
          )}
          <p className="text-sm text-fg">{helper}</p>
        </div>

        {showIssues && consistency ? (
          <div>
            <button
              type="button"
              onClick={() => setIssuesOpen((v) => !v)}
              className="transition-swift flex items-center gap-1 text-xs font-medium text-danger hover:text-danger/80"
            >
              <ChevronIcon className={`h-3 w-3 transition-transform ${issuesOpen ? "rotate-90" : ""}`} />
              {consistency.issues.length} issue{consistency.issues.length === 1 ? "" : "s"} to resolve
            </button>
            {issuesOpen ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {consistency.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-fg">
                    <p>{issue.message}</p>
                    {issue.nodeKeys.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {issue.nodeKeys.map((key) => (
                          <span key={key} className="bg-bg/40 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                            {key}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {confirmConflict ? (
          <div className="border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            <div className="flex items-start justify-between gap-2">
              <p>{confirmConflict.message}</p>
              <button type="button" onClick={onDismissConflict} className="shrink-0 text-danger/70 hover:text-danger">
                ✕
              </button>
            </div>
            {confirmConflict.issues?.length ? (
              <ul className="mt-1.5 flex flex-col gap-1">
                {confirmConflict.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {isCreator ? (
        <Button onClick={onConfirm} disabled={!canConfirm || isConfirming} className="shrink-0">
          {isConfirming ? "Confirming…" : "Confirm Architecture"}
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-fg-faint">Only the creator can confirm</span>
      )}
    </div>
  );
}
