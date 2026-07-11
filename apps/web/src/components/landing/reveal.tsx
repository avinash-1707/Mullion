"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms, applied as transition-delay. */
  delay?: number;
  /** "art" adds a slight settle-down scale for imagery. */
  variant?: "default" | "art";
}

// Scroll-triggered enter animation. The hidden state lives on the same
// element the observer watches, added here (client-side) rather than in
// markup, so users without JavaScript still see the whole page. Reveals
// once and unobserves — content should not vanish when scrolled past.
export function Reveal({ children, className, delay = 0, variant = "default" }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("lp-shown");
      return;
    }

    node.classList.add("lp-reveal");
    // Already in view on mount (above the fold, or anchor-jumped): show on
    // the next frame so the transition still runs from the hidden state.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.classList.add("lp-shown");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal={variant === "art" ? "art" : undefined}
      style={delay ? ({ "--lp-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
