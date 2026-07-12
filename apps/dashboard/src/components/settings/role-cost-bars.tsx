import { roleLabel, type AnalyticsByRole } from "@/lib/settings-api";
import { formatUsd } from "@/lib/format";

interface RoleCostBarsProps {
  roles: AnalyticsByRole[];
}

// Single-series magnitude comparison across a fixed small set of
// categories (the six roles) — one hue (accent), bars scaled to the max,
// sorted biggest-spender-first so the shape reads at a glance. Track is a
// step above the page background (bg-elevated, same tone Skeleton uses)
// rather than a stroked outline — CODING_STANDARDS dataviz convention:
// separate marks with surface, never a border drawn around them.
export function RoleCostBars({ roles }: RoleCostBarsProps) {
  const sorted = [...roles].sort((a, b) => b.costUsd - a.costUsd);
  const maxCost = Math.max(...sorted.map((role) => role.costUsd), 0.000001);

  return (
    <ul className="flex flex-col gap-3">
      {sorted.map((role) => {
        // A real-but-tiny cost still gets a sliver of visible bar rather
        // than rounding to nothing against the max.
        const widthPct = role.costUsd > 0 ? Math.max((role.costUsd / maxCost) * 100, 2) : 0;
        return (
          <li key={role.role} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
                {roleLabel(role.role)}
              </span>
              <span className="font-mono text-xs text-fg">{formatUsd(role.costUsd)}</span>
            </div>
            <div className="h-1.5 w-full bg-elevated">
              <div className="h-full bg-accent" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
