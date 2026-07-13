"use client";

import { useState } from "react";
import type { EscalationDecisionBody } from "@mullion/schemas";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { WarningIcon } from "../planning/icons";

interface BuildEscalationGateProps {
  specTaskId: string;
  reason: string;
  onDecide: (body: EscalationDecisionBody) => void;
  isSubmitting: boolean;
  error: string | null;
  onDismissError: () => void;
}

const REDIRECT_MAX_LENGTH = 4_000;

type PendingAction = "approve" | "redirect" | "abandon" | null;

// The escalation gate — ADR-07: mechanically and visually DISTINCT from
// Phase 2's EditPromptBar. Where that bar is a calm, always-available,
// accent-toned dock at the bottom of the screen, this is an interruption:
// danger-toned, injected at the TOP of the content it blocks, framed as
// "action needed" rather than an open invitation to change something.
// Users should never mistake "the build is stuck on one task" for "I can
// redesign the plan now."
export function BuildEscalationGate({
  specTaskId,
  reason,
  onDecide,
  isSubmitting,
  error,
  onDismissError,
}: BuildEscalationGateProps) {
  const [redirectOpen, setRedirectOpen] = useState(false);
  const [redirectText, setRedirectText] = useState("");
  // Tracks which specific action is in flight so only that button shows a
  // busy label — approve/redirect/abandon share one mutation upstream.
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  function decide(action: PendingAction, body: EscalationDecisionBody) {
    setPendingAction(action);
    onDecide(body);
  }

  const canSubmitRedirect = redirectText.trim().length > 0 && redirectText.length <= REDIRECT_MAX_LENGTH;

  return (
    <div className="animate-reveal border-y-2 border-danger bg-danger-soft px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-danger/40 bg-danger/15 text-danger">
            <WarningIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-danger">Escalation - action needed</p>
            <h2 className="mt-1 font-serif text-xl leading-snug text-fg">
              Task <span className="font-mono text-base text-danger">{specTaskId}</span> needs a decision
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-fg">{reason}</p>
            <p className="mt-1.5 font-mono text-[11px] text-danger/75">
              This gate expires automatically after 30 minutes - an unanswered gate abandons this task and the build
              continues with what exists.
            </p>
          </div>
        </div>

        {error ? (
          <div className="flex items-start justify-between gap-2 border border-danger/30 bg-bg/40 px-3 py-2 text-xs text-danger">
            <p>{error}</p>
            <button type="button" onClick={onDismissError} className="shrink-0 text-danger/70 hover:text-danger">
              ✕
            </button>
          </div>
        ) : null}

        {redirectOpen ? (
          <div className="flex flex-col gap-2.5 border border-danger/30 bg-bg/40 p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-danger/80">
              Redirect - scoped to this task only
            </p>
            <Textarea
              fieldId="escalation-redirect"
              aria-label="Redirect instruction, scoped to this task"
              rows={3}
              value={redirectText}
              onChange={(event) => setRedirectText(event.target.value)}
              placeholder={`One instruction for the Coder on ${specTaskId}, e.g. "skip the retry logic and just log the error"`}
              maxLength={REDIRECT_MAX_LENGTH + 200}
              disabled={isSubmitting}
              className="w-full"
            />
            <div className="flex items-center justify-between gap-3">
              <span className={`font-mono text-[11px] ${redirectText.length > REDIRECT_MAX_LENGTH ? "text-danger" : "text-fg-faint"}`}>
                {redirectText.length.toLocaleString()} / {REDIRECT_MAX_LENGTH.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRedirectOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => decide("redirect", { specTaskId, redirect: redirectText.trim() })}
                  disabled={!canSubmitRedirect || isSubmitting}
                >
                  {isSubmitting && pendingAction === "redirect" ? "Sending…" : "Send redirect"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => decide("approve", { specTaskId, decision: "approve" })}
              disabled={isSubmitting}
            >
              {isSubmitting && pendingAction === "approve" ? "Approving…" : "Approve - continue without this task"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRedirectOpen(true)} disabled={isSubmitting}>
              Redirect this task
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => decide("abandon", { specTaskId, decision: "abandon" })}
              disabled={isSubmitting}
              className="border-danger/40 text-danger hover:border-danger hover:text-danger"
            >
              {isSubmitting && pendingAction === "abandon" ? "Abandoning…" : "Abandon - finish with what exists"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
