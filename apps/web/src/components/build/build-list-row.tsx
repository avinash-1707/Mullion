import Link from "next/link";
import type { BuildRun } from "@mullion/schemas";
import { BuildStatusBadge } from "./build-status-badge";
import { ChevronIcon } from "../planning/icons";
import { formatDateTime, shortId } from "../../lib/build-format";

interface BuildListRowProps {
  run: BuildRun;
}

export function BuildListRow({ run }: BuildListRowProps) {
  return (
    <Link
      href={`/builds/${run.id}`}
      className="transition-swift group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 hover:border-border-strong hover:bg-elevated"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded-md bg-elevated px-2 py-0.5 font-mono text-xs text-fg-muted group-hover:bg-bg">
          {shortId(run.id)}
        </span>
        <span className="truncate text-xs text-fg-faint">{formatDateTime(run.createdAt)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <BuildStatusBadge status={run.status} />
        <ChevronIcon className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
