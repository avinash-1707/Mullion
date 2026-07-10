"use client";

import { useMutation } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { BuildIcon, DownloadIcon } from "./icons";
import { downloadSessionExport } from "../../lib/download-export";

interface ForkChoiceCardsProps {
  sessionId: string;
}

// Phase 4 (01 §6) — both forks consume the same frozen Build Spec; Fork A
// must work completely independently of Fork B ever landing (01 §9), so it's
// the only live button here — Fork B renders, visibly, as "not yet."
export function ForkChoiceCards({ sessionId }: ForkChoiceCardsProps) {
  const exportMutation = useMutation({
    mutationFn: () => downloadSessionExport(sessionId),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-2xl border border-accent/40 bg-accent-soft p-6">
        <div className="flex items-center gap-2 text-accent-strong">
          <DownloadIcon className="h-4 w-4" />
          <span className="font-mono text-xs uppercase tracking-[0.15em]">Fork A</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-fg">Export spec documents</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Requirements, architecture diagram, task graph, API contracts, and the full decision log — bundled as a
            downloadable archive. No build compute spent.
          </p>
        </div>
        <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="mt-auto self-start">
          {exportMutation.isPending ? "Preparing archive…" : "Download spec bundle"}
        </Button>
        {exportMutation.isError ? (
          <p role="alert" className="text-xs text-danger">
            {exportMutation.error.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border-strong bg-surface p-6 opacity-80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-fg-muted">
            <BuildIcon className="h-4 w-4" />
            <span className="font-mono text-xs uppercase tracking-[0.15em]">Fork B</span>
          </div>
          <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
            Arrives in Phase 2
          </span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-fg">Automated build</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Hand the same task graph to an agent team that codes, tests, reviews, and ships it end to end.
          </p>
        </div>
        <Button disabled className="mt-auto self-start">
          Build it for us
        </Button>
      </div>
    </div>
  );
}
