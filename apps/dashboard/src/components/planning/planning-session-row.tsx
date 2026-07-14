import Link from "next/link";
import type { PlanningSession } from "@mullion/schemas";
import { StatusPill } from "../build/build-status-badge";
import { ChevronIcon } from "./icons";
import { formatDateTime } from "../../lib/build-format";

// User-facing phase names, not the internal enum — "requirements" is the MCQ
// clarification stage (01 §3), "architecture" is live planning (01 §4).
const PHASE_LABEL: Record<PlanningSession["phase"], string> = {
  requirements: "Clarifying",
  architecture: "Planning",
};

interface PlanningSessionRowProps {
  session: PlanningSession;
}

export function PlanningSessionRow({ session }: PlanningSessionRowProps) {
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="transition-swift group flex items-center justify-between gap-3 border border-border bg-surface px-4 py-3.5 hover:-translate-y-[2px] hover:border-ember"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-sm text-fg">{session.idea}</span>
        <span className="shrink-0 font-mono text-xs text-fg-faint">
          {formatDateTime(session.createdAt)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <StatusPill label={PHASE_LABEL[session.phase]} tone="progress" size="md" />
        <ChevronIcon className="h-4 w-4 text-fg-faint transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
