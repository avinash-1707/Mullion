// Purely decorative window-pane grid for the landing hero — a literal
// mullion (the bar dividing panes of glass) rendered as a background
// texture, with one pane left lit. Static, not a looping animation: an
// always-on light in one window says "one plan taking shape" without the
// attention-seeking pulse a looping glow would read as.
export function MullionGrid() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 128px), repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 128px)",
        }}
      />
      <div className="absolute -right-6 top-16 h-32 w-32 rounded-sm bg-accent-soft blur-3xl sm:right-[8%] sm:top-24" />
      <div className="absolute -right-6 top-16 h-32 w-32 rounded-sm border border-accent/30 sm:right-[8%] sm:top-24" />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-bg to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-bg to-transparent" />
    </div>
  );
}
