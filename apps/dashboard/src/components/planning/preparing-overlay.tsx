"use client";

// Full-screen wait screen shown from the moment the idea is submitted until
// the /sessions/[id] route paints (at which point IdeaIntakeForm unmounts and
// takes this with it). Sits above the whole shell — fixed inset-0, z above the
// nav rail (z-50) and mobile drawer — over a blurred scrim of the hero behind.
// `role=status` + `aria-live=polite` so a screen reader announces the wait; the
// loader itself is decorative and hidden from the tree. The animated bouncing-
// dot loader and the scrim fade both live in globals.css (.prep-loader,
// .animate-overlay-fade) — see there for the reduced-motion behaviour.
export function PreparingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-overlay-fade fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-bg/80 backdrop-blur-md"
    >
      <span className="prep-loader" aria-hidden="true" />
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-fg-muted">
        Preparing environment
      </p>
    </div>
  );
}
