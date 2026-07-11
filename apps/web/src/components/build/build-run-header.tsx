import Link from "next/link";
import type { BuildRun } from "@mullion/schemas";
import { BuildStatusBadge } from "./build-status-badge";
import { BuildIcon } from "../planning/icons";
import { formatDateTime, shortId } from "../../lib/build-format";

interface BuildRunHeaderProps {
  run: BuildRun;
}

// Mirrors sessions/[id]/page.tsx's own header bar (back-link + identity +
// state chip) so a run page reads as a sibling of a planning session, not a
// different product.
export function BuildRunHeader({ run }: BuildRunHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/builds" className="transition-swift shrink-0 text-sm text-fg-faint hover:text-fg-muted">
          ← Builds
        </Link>
        <span className="flex shrink-0 items-center gap-1.5 text-fg-muted">
          <BuildIcon className="h-4 w-4 shrink-0" />
          <span className="font-mono text-xs">{shortId(run.id)}</span>
        </span>
        <span className="hidden truncate text-xs text-fg-faint sm:inline">Started {formatDateTime(run.createdAt)}</span>
      </div>
      <BuildStatusBadge status={run.status} />
    </div>
  );
}
