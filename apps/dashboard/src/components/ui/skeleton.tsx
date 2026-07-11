interface SkeletonProps {
  className?: string;
}

// A shape placeholder, not a spinner — used wherever the content's final
// layout is already known (CODING_STANDARDS §9). Reduced motion collapses
// the pulse to a single static frame globally (see globals.css).
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-skeleton rounded-md bg-elevated ${className}`} aria-hidden="true" />;
}
