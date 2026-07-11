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
    <div className="border-b border-hairline px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Link
              href="/builds"
              className="transition-swift shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint hover:text-fg-muted"
            >
              ← Builds
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">{shortId(run.id)}</span>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2 font-serif text-2xl leading-tight text-fg">
            <BuildIcon className="h-4 w-4 shrink-0 text-fg-muted" />
            Build run
          </h1>
          <p className="mt-1 font-mono text-xs text-fg-faint">Started {formatDateTime(run.createdAt)}</p>
        </div>
        <BuildStatusBadge status={run.status} />
      </div>
    </div>
  );
}
