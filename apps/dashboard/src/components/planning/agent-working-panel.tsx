import type { CSSProperties } from "react";

// Carries this arm's resting angle into CSS as --orbit-start (globals.css's
// agent-orbit-spin keyframe) — see that keyframe's comment for why the
// offset is baked in here rather than left to animation-delay.
interface OrbitArmStyle extends CSSProperties {
  "--orbit-start"?: string;
}

const ORBIT_ARMS: { angle: number; opacityClass: string }[] = [
  { angle: 0, opacityClass: "opacity-100" },
  { angle: 120, opacityClass: "opacity-70" },
  { angle: 240, opacityClass: "opacity-45" },
];

interface AgentWorkingPanelProps {
  label: string;
}

// Main pane's "nothing actionable yet" state (the diagram's position) —
// covers both "no rounds yet" and "drafting the doc," the two moments the
// analyst is working and there's nothing for the user to do but wait. A
// purposeful mark rather than a bare spinner-in-a-void: three ember motes
// orbit a breathing gilt core, the same "pieces settling into place" idea
// the architecture phase later makes literal with real nodes. Fills the
// pane edge-to-edge with the diagram's own frame (border border-border
// bg-bg) so the two phases' main panes read as one family even mid-loop.
export function AgentWorkingPanel({ label }: AgentWorkingPanelProps) {
  return (
    <div className="flex h-full min-h-[20rem] w-full flex-col items-center justify-center gap-6 border border-border bg-bg lg:min-h-0">
      <div className="relative h-20 w-20" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border border-gilt/20" />
        {ORBIT_ARMS.map((arm) => {
          const armStyle: OrbitArmStyle = { "--orbit-start": `${arm.angle}deg` };
          return (
            <span key={arm.angle} className="animate-agent-orbit absolute inset-0" style={armStyle}>
              <span className={`absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-sm bg-ember ${arm.opacityClass}`} />
            </span>
          );
        })}
        <span className="animate-agent-breathe absolute inset-[38%] rounded-[3px] bg-gilt" />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">{label}</p>
    </div>
  );
}
