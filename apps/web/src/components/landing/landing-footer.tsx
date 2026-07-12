import Link from "next/link";
import { MullionMark } from "@/components/mullion-mark";

const EXPLORE_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#agents", label: "The crew" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function LandingFooter() {
  return (
    <footer className="overflow-hidden border-t border-hairline-dark bg-ink text-cream">
      <div className="mx-auto w-full max-w-[1320px] px-6 pt-20 sm:px-10 lg:pt-24">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5">
              <MullionMark className="h-6 w-6" />
              <span className="font-serif text-2xl tracking-tight">Mullion</span>
            </div>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-parchment-faint">
              Describe it. Watch the plan take shape. Approve the build. Own the result.
            </p>
            <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.4em] text-gilt">
              Idea meets execution
            </p>
          </div>

          <nav className="md:col-span-3 md:col-start-7" aria-label="Explore">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-gilt">Explore</h3>
            <ul className="mt-6">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.href} className="mt-3 first:mt-0">
                  <a
                    href={link.href}
                    className="font-serif text-lg text-parchment outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="md:col-span-3" aria-label="Begin">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-gilt">Begin</h3>
            <ul className="mt-6">
              <li>
                <Link
                  href="/sign-in"
                  className="font-serif text-lg text-parchment outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember"
                >
                  Sign in
                </Link>
              </li>
              <li className="mt-3">
                <Link
                  href="/sign-up"
                  className="font-serif text-lg text-parchment outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember"
                >
                  Create an account
                </Link>
              </li>
              <li className="mt-8">
                <Link
                  href="/sign-up"
                  className="inline-block rounded-md bg-ember px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-cream outline-none transition-[background-color,transform] duration-200 hover:bg-ember-strong focus-visible:bg-ember-strong active:scale-[0.97]"
                >
                  Start building
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Oversized watermark wordmark, deliberately cropped by the page
            edge like a printer's mark. Decorative only. */}
        <p
          aria-hidden="true"
          className="pointer-events-none -mb-[0.22em] mt-16 select-none text-center font-serif text-[clamp(5rem,17vw,15rem)] leading-none tracking-tight text-cream/[0.07]"
        >
          Mullion
        </p>
      </div>

      <div className="border-t border-hairline-dark">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-parchment-faint">
            &copy; 2026 Mullion
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-parchment-faint">
            Plan-led. Spec-first. Delivery-driven.
          </p>
        </div>
      </div>
    </footer>
  );
}
