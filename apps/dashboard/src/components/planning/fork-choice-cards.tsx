"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createBuildBodySchema, buildRunSchema } from "@mullion/schemas";
import { Button } from "../ui/button";
import { BuildIcon, DownloadIcon } from "./icons";
import { downloadSessionExport } from "../../lib/download-export";
import { apiFetch } from "../../lib/api";

interface ForkChoiceCardsProps {
  sessionId: string;
  buildSpecId: string;
}

// Phase 4 (01 §6) — both forks consume the same frozen Build Spec. Fork A
// (export) works completely independently of Fork B (01 §9); Fork B posts
// the frozen spec to the Build Orchestrator and, on any of the endpoint's
// 2xx outcomes (created, resumed-existing, or ambiguous-but-queued — see
// apps/api routes/builds.ts), takes the returned run id straight to its
// dashboard.
export function ForkChoiceCards({ sessionId, buildSpecId }: ForkChoiceCardsProps) {
  const router = useRouter();

  const exportMutation = useMutation({
    mutationFn: () => downloadSessionExport(sessionId),
  });

  const buildMutation = useMutation({
    mutationFn: async () => {
      const body = await apiFetch("/api/builds", {
        method: "POST",
        body: JSON.stringify(createBuildBodySchema.parse({ buildSpecId })),
      });
      return buildRunSchema.parse(body);
    },
    onSuccess: (run) => {
      router.push(`/builds/${run.id}`);
    },
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-4 border border-hairline bg-accent-soft p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1">
        <div className="flex items-center gap-2 text-gilt">
          <DownloadIcon className="h-4 w-4" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em]">Fork A</span>
        </div>
        <div>
          <h3 className="font-serif text-xl leading-snug text-fg">Export spec documents</h3>
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

      <div className="flex flex-col gap-4 border border-hairline bg-surface p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1">
        <div className="flex items-center gap-2 text-gilt">
          <BuildIcon className="h-4 w-4" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em]">Fork B</span>
        </div>
        <div>
          <h3 className="font-serif text-xl leading-snug text-fg">Automated build</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Hand the same task graph to an agent team that codes, tests, reviews, and ships it end to end.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => buildMutation.mutate()}
          disabled={buildMutation.isPending}
          className="mt-auto self-start"
        >
          {buildMutation.isPending ? "Starting the build…" : "Build it for us"}
        </Button>
        {buildMutation.isError ? (
          <p role="alert" className="text-xs text-danger">
            {buildMutation.error.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
