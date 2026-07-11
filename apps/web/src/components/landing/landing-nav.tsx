"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MullionMark } from "@/components/mullion-mark";

// Anchors carry the leading slash so they resolve from any marketing page;
// on the landing page itself Lenis still intercepts them (same pathname)
// and scrolls smoothly instead of reloading.
const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#agents", label: "The crew" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

// Floating nav: transparent full-width while laid over the hero, then a
// detached floating bar once the page scrolls — 20% narrower (1320px →
// 1056px), dropped below the top edge, cream glass with a heavy backdrop
// blur and a hairline frame. The bar's max-width, offset and height all
// ride one transition on the single brand curve so the states morph
// instead of swapping.
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Entrance rides the outer header (translateY keyframe) so it can't
    // fight the inner div's scroll-morph transitions.
    <header className="animate-reveal-down fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto flex items-center justify-between transition-[max-width,margin-top,height,padding,background-color,border-color,box-shadow,backdrop-filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          scrolled
            ? // px matches the ~13.5px vertical inset around the CTA inside
              // the h-16 bar, so the floating state reads as one uniform frame.
              "mt-3 h-16 max-w-[min(66rem,calc(100%-1.5rem))] border border-hairline-light bg-cream/75 px-3.5 shadow-[0_1px_2px_rgba(8,8,13,0.05),0_12px_32px_-8px_rgba(8,8,13,0.14)] backdrop-blur-xl"
            : "mt-0 h-20 max-w-[1320px] border border-transparent bg-transparent px-6 sm:px-10"
        }`}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 text-ink transition-colors duration-200 hover:text-ember"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-2xl tracking-tight">Mullion</span>
        </Link>

        <nav className="hidden items-center gap-9 md:flex" aria-label="Landing sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted transition-colors duration-200 hover:text-ember"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-6">
          {/* These sit over the hero artwork at wide widths, where the
              backdrop shifts from cream to near-black as the viewport grows,
              so both use treatments that read on either surface. */}
          <Link
            href="/sign-in"
            className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-ember transition-colors duration-200 hover:text-ember-strong sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-ember px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97]"
          >
            Start building
          </Link>
        </div>
      </div>
    </header>
  );
}
