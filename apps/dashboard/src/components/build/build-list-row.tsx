import Link from "next/link";
import type { BuildListItem, BuildStage } from "@mullion/schemas";
import { BuildStageBadge } from "./build-status-badge";
import { ChevronIcon } from "../planning/icons";
import { formatDateTime } from "../../lib/build-format";

// Pre-run stages live on the planning page; once a run exists the row jumps
// straight to it (ADR-83).
const PLANNING_STAGES: ReadonlySet<BuildStage> = new Set([
  "clarifying",
  "planning",
  "confirmed",
  "abandoned",
]);

function hrefFor(build: BuildListItem): string {
  if (!PLANNING_STAGES.has(build.stage) && build.latestRunId) {
    return `/builds/${build.latestRunId}`;
  }
  return `/sessions/${build.sessionId}`;
}

interface BuildListRowProps {
  build: BuildListItem;
}

export function BuildListRow({ build }: BuildListRowProps) {
  return (
    <Link
      href={hrefFor(build)}
      className="transition-swift group flex items-center justify-between gap-3 border border-border bg-surface px-4 py-3.5 hover:-translate-y-[2px] hover:border-ember"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm text-fg">{build.idea}</span>
        <span className="shrink-0 font-mono text-xs text-fg-faint">
          {formatDateTime(build.createdAt)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <BuildStageBadge stage={build.stage} />
        <ChevronIcon className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
