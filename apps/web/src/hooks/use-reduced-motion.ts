"use client";

import { useSyncExternalStore } from "react";

// The one place JS needs to know about prefers-reduced-motion — everything
// CSS-driven already collapses via the global media query in globals.css,
// but a few effects here are JS-driven (React Flow's fitView pan/zoom,
// scrollIntoView) and take a duration argument CSS can't intercept.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Server render can't know the preference — default to motion-off there so
// the first paint never animates against the user's wishes.
function getServerSnapshot(): boolean {
  return true;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
