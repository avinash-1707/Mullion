// Shared number/currency formatting for the analytics tab. Kept tiny and
// local rather than pulled in from a library — three Intl calls don't earn
// a dependency.

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

// Sub-cent LLM costs are common (a single fast-tier call can cost
// fractions of a cent) — more fraction digits for anything under $1 so a
// real cost doesn't round away to "$0.00".
export function formatUsd(value: number): string {
  const maximumFractionDigits = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

// `day` arrives as "YYYY-MM-DD" (GET /analytics's byDay shape) — parsed as
// UTC midnight and formatted back in UTC so the label never drifts a day
// depending on the viewer's timezone offset.
export function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}
