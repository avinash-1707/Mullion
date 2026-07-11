import type { BuildRun, BuildTask } from "@mullion/schemas";
import { CheckIcon, WarningIcon } from "../planning/icons";

export type Tone = "neutral" | "progress" | "success" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border-strong bg-elevated text-fg-muted",
  progress: "border-accent/40 bg-accent-soft text-accent-strong",
  success: "border-success/40 bg-success-soft text-success-strong",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

// Only these two tones render as a dot — "success"/"danger" get a check or
// warning glyph instead (see StatusPill), so this stays scoped to the two
// tones that actually use it.
const DOT_CLASSES: Record<Extract<Tone, "neutral" | "progress">, string> = {
  neutral: "bg-fg-faint",
  progress: "bg-accent animate-pulse",
};

const RUN_STATUS_CONFIG: Record<BuildRun["status"], { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  building: { label: "Building", tone: "progress" },
  testing: { label: "Testing", tone: "progress" },
  reviewing: { label: "Reviewing", tone: "progress" },
  fixing: { label: "Fixing", tone: "progress" },
  shipping: { label: "Shipping", tone: "progress" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

const TASK_STATUS_CONFIG: Record<BuildTask["status"], { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  running: { label: "Running", tone: "progress" },
  verified: { label: "Verified", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

interface StatusPillProps {
  label: string;
  tone: Tone;
  size: "md" | "sm";
}

// Shared visual primitive behind both badges below — done/failed/in-flight
// read as genuinely distinct at a glance via glyph (check/warning/dot), not
// color alone, so the difference survives colorblindness and grayscale.
function StatusPill({ label, tone, size }: StatusPillProps) {
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 border font-mono uppercase tracking-[0.15em]",
        size === "md" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]",
        TONE_CLASSES[tone],
      ].join(" ")}
    >
      {tone === "success" ? (
        <CheckIcon className={iconSize} />
      ) : tone === "danger" ? (
        <WarningIcon className={iconSize} />
      ) : (
        <span className={`h-1.5 w-1.5 shrink-0 ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function BuildStatusBadge({ status }: { status: BuildRun["status"] }) {
  const config = RUN_STATUS_CONFIG[status];
  return <StatusPill label={config.label} tone={config.tone} size="md" />;
}

export function TaskStatusPill({ status }: { status: BuildTask["status"] }) {
  const config = TASK_STATUS_CONFIG[status];
  return <StatusPill label={config.label} tone={config.tone} size="sm" />;
}

// Exposed for components (dependency chips, delivery notes) that need to
// derive a tone from a status string without importing the config maps.
export function toneForTaskStatus(status: BuildTask["status"]): Tone {
  return TASK_STATUS_CONFIG[status].tone;
}
