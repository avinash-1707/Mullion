"use client";

import { useState } from "react";
import type { DecisionEntry, GraphEdge, GraphNode } from "@mullion/schemas";
import { ArchitectureDiagram } from "./architecture-diagram";
import { DecisionLogPanel } from "./decision-log-panel";
import { ForkActions } from "./fork-actions";
import { CheckIcon, CopyIcon, LockIcon } from "./icons";

interface ConfirmedViewProps {
  sessionId: string;
  buildSpecId: string;
  contentHash: string;
  frozenAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  decisions: DecisionEntry[];
  userName: string;
  userImage: string | null;
}

function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="transition-swift inline-flex items-center gap-1.5 px-1.5 py-0.5 text-fg-muted hover:bg-elevated hover:text-fg"
      aria-label="Copy content hash"
    >
      {copied ? (
        <CheckIcon key="check" className="h-3.5 w-3.5 animate-reveal text-accent" />
      ) : (
        <CopyIcon key="copy" className="h-3.5 w-3.5 animate-reveal" />
      )}
    </button>
  );
}

// Phase 3 freeze (01 §5) — the one mode switch the user must recognize
// without a tooltip (01 §9 success criterion): a distinct sealed band, plus
// diagram/log becoming read-only (no edit bar, no confirm panel at all).
export function ConfirmedView({
  sessionId,
  buildSpecId,
  contentHash,
  frozenAt,
  nodes,
  edges,
  decisions,
  userName,
  userImage,
}: ConfirmedViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-strong bg-elevated px-4 py-3.5 sm:px-6">
        <LockIcon className="h-4 w-4 shrink-0 text-accent" />
        <p className="text-sm font-medium text-fg">
          Architecture frozen
          <span className="mx-2 text-fg-faint">·</span>
          <span className="font-mono text-xs text-fg-muted">{contentHash}</span>
        </p>
        <CopyHashButton hash={contentHash} />
        <span className="ml-auto text-xs text-fg-faint">
          {new Date(frozenAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:overflow-hidden">
        <div className="min-h-[20rem] flex-1 lg:min-h-0">
          <ArchitectureDiagram nodes={nodes} edges={edges} issues={[]} />
        </div>
        <div className="flex min-h-[16rem] flex-1 flex-col gap-3 lg:min-h-0 lg:w-[23rem] lg:flex-none">
          <ForkActions sessionId={sessionId} buildSpecId={buildSpecId} />
          <div className="min-h-[14rem] flex-1 lg:min-h-0">
            <DecisionLogPanel
              decisions={decisions}
              clarifications={[]}
              userName={userName}
              userImage={userImage}
              isCreator={false}
              agentBusy={false}
              onChooseClarificationOption={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
