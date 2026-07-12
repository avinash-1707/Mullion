"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AnalyticsByDay } from "@/lib/settings-api";
import { formatDayLabel, formatUsd } from "@/lib/format";

interface SpendSparklineProps {
  data: AnalyticsByDay[];
}

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 120;
const PAD_X = 4;
const PAD_Y = 14;

interface PlottedPoint {
  x: number;
  y: number;
  day: string;
  costUsd: number;
}

// Inline-SVG single-series area/line — low daily volume (≤30 points from
// GET /analytics), so a charting library would be pure overhead. One hue
// (accent line + accent-soft area wash), no gridlines/second axis — a
// sparkline by convention carries no chrome, just the shape plus a hover
// readout for the exact value. Hover works by pointer (desktop) and by
// arrow keys once focused (keyboard), both driving the same `hoverIndex`
// state so there's one code path for "what's the active point".
export function SpendSparkline({ data }: SpendSparklineProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo<PlottedPoint[]>(() => {
    if (data.length === 0) return [];
    const maxCost = Math.max(...data.map((day) => day.costUsd), 0.000001);
    const stepX = data.length > 1 ? (VIEW_WIDTH - PAD_X * 2) / (data.length - 1) : 0;
    return data.map((day, index) => ({
      x: PAD_X + stepX * index,
      y: VIEW_HEIGHT - PAD_Y - (day.costUsd / maxCost) * (VIEW_HEIGHT - PAD_Y * 2),
      day: day.day,
      costUsd: day.costUsd,
    }));
  }, [data]);

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) return null;

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const baselineY = VIEW_HEIGHT - PAD_Y;
  const areaPath = `${linePath} L${lastPoint.x},${baselineY} L${firstPoint.x},${baselineY} Z`;

  function nearestIndexToClientX(clientX: number, rect: DOMRect): number {
    const relativeX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let closest = 0;
    let closestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.abs(point.x - relativeX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    return closest;
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    setHoverIndex(nearestIndexToClientX(event.clientX, event.currentTarget.getBoundingClientRect()));
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setHoverIndex((current) => Math.min((current ?? -1) + 1, points.length - 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setHoverIndex((current) => Math.max((current ?? points.length) - 1, 0));
    }
  }

  const active = hoverIndex !== null ? points[hoverIndex] : undefined;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-28 w-full touch-none"
        tabIndex={0}
        role="img"
        aria-label={`Daily spend over the last ${points.length} days, ${formatUsd(firstPoint.costUsd)} on ${formatDayLabel(firstPoint.day)} to ${formatUsd(lastPoint.costUsd)} on ${formatDayLabel(lastPoint.day)}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
        onBlur={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={PAD_X}
          y1={baselineY}
          x2={VIEW_WIDTH - PAD_X}
          y2={baselineY}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {active ? (
          <>
            <line x1={active.x} y1={PAD_Y} x2={active.x} y2={baselineY} stroke="var(--color-border-strong)" strokeWidth={1} />
            <circle cx={active.x} cy={active.y} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
          </>
        ) : null}
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[11px] text-fg-faint">
        <span>{formatDayLabel(firstPoint.day)}</span>
        <span>{formatDayLabel(lastPoint.day)}</span>
      </div>

      {active ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap border border-border-strong bg-surface px-2.5 py-1.5 font-mono text-xs text-fg shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
          style={{ left: `${(active.x / VIEW_WIDTH) * 100}%` }}
        >
          <p className="text-fg-faint">{formatDayLabel(active.day)}</p>
          <p>{formatUsd(active.costUsd)}</p>
        </div>
      ) : null}
    </div>
  );
}
