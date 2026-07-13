// Median of a number list — the basis for the analytics per-run outlier
// cue (ADR-78: a run costing > 2x the median of fetched rows gets flagged).
// Lives in lib/ so the pure math is unit-testable apart from the component.
export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}
