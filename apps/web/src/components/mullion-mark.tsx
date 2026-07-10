interface MullionMarkProps {
  className?: string;
}

// The product's namesake: a window frame divided into panes by a mullion
// cross, with one pane lit — an idea, then a plan, then a build, always one
// pane at a time. Doubles as the favicon-scale logomark and a larger hero
// motif; stroke uses currentColor so it adapts to its wrapping text color,
// the lit pane stays a fixed accent regardless of context.
export function MullionMark({ className = "h-6 w-6" }: MullionMarkProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="23" height="23" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 2.5V25.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 14H25.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14.85" y="3.35" width="10.1" height="10.1" rx="2.2" style={{ fill: "var(--color-accent)" }} opacity="0.9" />
    </svg>
  );
}
