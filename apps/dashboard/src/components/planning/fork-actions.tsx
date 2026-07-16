"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBuildBodySchema, buildRunSchema } from "@mullion/schemas";
import { Button } from "../ui/button";
import { BuildIcon, DownloadIcon } from "./icons";
import { downloadSessionExport } from "../../lib/download-export";
import { apiFetch } from "../../lib/api";

interface ForkActionsProps {
  sessionId: string;
  buildSpecId: string;
}

// Phase 4 (01 §6) — both forks consume the same frozen Build Spec. Fork A
// (export) works completely independently of Fork B (01 §9); Fork B posts
// the frozen spec to the Build Orchestrator and, on any of the endpoint's
// 2xx outcomes (created, resumed-existing, or ambiguous-but-queued — see
// apps/api routes/builds.ts), takes the returned run id straight to its
// dashboard.
export function ForkActions({ sessionId, buildSpecId }: ForkActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

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
      // The build's stage/link target just changed (ADR-83) — refresh the
      // builds page and dashboard recents lists.
      void queryClient.invalidateQueries({ queryKey: ["builds"] });
      router.push(`/builds/${run.id}`);
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} className="flex-1">
          <DownloadIcon className="mr-1.5 h-4 w-4" />
          {exportMutation.isPending ? "Preparing archive…" : "Download spec bundle"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => buildMutation.mutate()}
          disabled={buildMutation.isPending}
          className="flex-1"
        >
          <BuildIcon className="mr-1.5 h-4 w-4" />
          {buildMutation.isPending ? "Starting the build…" : "Build it for us"}
        </Button>
      </div>
      {exportMutation.isError ? (
        <p role="alert" className="text-xs text-danger">
          {exportMutation.error.message}
        </p>
      ) : null}
      {buildMutation.isError ? (
        <p role="alert" className="text-xs text-danger">
          {buildMutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
