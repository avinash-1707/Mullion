"use client";

import { useEffect, useState } from "react";

// One-shot "has this element ever entered the viewport" signal for
// scroll-triggered entrances (recent-builds section on the dashboard home
// page). Deliberately does NOT toggle back off once the element scrolls
// back out — a section re-fading in every time the user scrolls past it
// would read as nagging for attention, not a considered reveal, so the
// observer disconnects itself the moment it has fired once.
//
// `ref` is a callback ref holding the node in state, not a RefObject: the
// observed element can mount well after the calling component does (the
// recent-builds section only exists once its query resolves with rows), and
// an effect reading `ref.current` at mount time would run against null and
// never re-fire. The callback ref re-runs the effect whenever the node
// actually attaches.
//
// Kept intentionally small (no options object, no repeat-trigger mode) —
// this page is the only caller today. Grow the API when a second caller
// actually needs something different, not preemptively.
export function useInView<T extends Element>() {
  const [node, setNode] = useState<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
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
  }, [node, isInView]);

  return { ref: setNode, isInView };
}
