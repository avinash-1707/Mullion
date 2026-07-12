interface StatTileProps {
  label: string;
  value: string;
}

// Gilt-eyebrow/mono-numeral chip: the same eyebrow recipe used above every
// page title (font-mono, uppercase, gilt) paired with a mono numeral value
// — mono rather than the generic "sans semibold" stat-tile convention on
// purpose, matching this product's existing mono-numeral treatment for
// IDs/timestamps/session emails (design-context.md "Mono metadata").
export function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gilt">{label}</p>
      <p className="mt-2 font-mono text-2xl text-fg">{value}</p>
    </div>
  );
}
