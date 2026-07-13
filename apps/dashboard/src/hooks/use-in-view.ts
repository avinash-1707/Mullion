"use client";

import { useEffect, useRef, useState } from "react";

// One-shot "has this element ever entered the viewport" signal for
// scroll-triggered entrances (recent-builds section on the dashboard home
// page). Deliberately does NOT toggle back off once the element scrolls
// back out — a section re-fading in every time the user scrolls past it
// would read as nagging for attention, not a considered reveal, so the
// observer disconnects itself the moment it has fired once.
//
// Kept intentionally small (no options object, no repeat-trigger mode) —
// this page is the only caller today. Grow the API when a second caller
// actually needs something different, not preemptively.
export function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    // Nothing to observe, or already fired (this effect re-runs once
    // isInView flips true; the cleanup below already disconnected the
    // observer by then, so just stop here instead of re-observing).
    if (!node || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
        }
      },
      // Trips a little before the section's top edge reaches the bottom of
      // the viewport, so the reveal is already mid-flight (not just
      // starting) by the time the user's eye actually gets there.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView]);

  return { ref, isInView };
}
