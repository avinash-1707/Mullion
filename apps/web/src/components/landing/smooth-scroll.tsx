"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useEffect, useState, type ReactNode } from "react";

// Lenis smooth scrolling, marketing surface only. Mounted client-side and
// disabled entirely for prefers-reduced-motion users, who fall back to
// native scrolling (globals.css scopes its own smooth-scroll fallback to
// html:not(.lenis) so the two never fight). anchors: true makes Lenis
// drive in-page #links; the -40px offset reproduces the sections'
// scroll-mt-10 breathing room, which Lenis does not read.
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <ReactLenis root options={{ autoRaf: true, anchors: { offset: -40 } }}>
      {children}
    </ReactLenis>
  );
}
