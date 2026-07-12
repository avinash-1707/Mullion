import Link from "next/link";
import { Reveal } from "./reveal";

// Placeholder tiers: prices and feature lists are stand-ins to be edited
// by hand, not wired to anything.
const PRICING_TIERS = [
  {
    name: "Explorer",
    price: "$0",
    period: "forever",
    blurb: "For trying the idea out and planning in the open.",
    features: [
      "One planning session at a time",
      "Live diagram and decision log",
      "Export the full specs",
      "Community support",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Builder",
    price: "$49",
    period: "per month",
    blurb: "For shipping real projects, end to end.",
    features: [
      "Everything in Explorer",
      "One active build at a time",
      "Approval gates during the build",
      "Delivery to GitHub or archive",
      "Email support",
    ],
    cta: "Start building",
    featured: true,
  },
  {
    name: "Studio",
    price: "$199",
    period: "per month",
    blurb: "For teams that build all the time.",
    features: [
      "Everything in Builder",
      "Higher build budgets",
      "Team workspace",
      "Priority build queue",
      "Priority support",
    ],
    cta: "Start with Studio",
    featured: false,
  },
] as const;

export function Pricing({ hideHeader = false }: { hideHeader?: boolean }) {
  return (
    <section id="pricing" className="scroll-mt-10 bg-ink text-cream">
      <div className="mx-auto w-full max-w-[1320px] px-6 py-28 sm:px-10 lg:py-36">
        {!hideHeader && (
          <div className="flex flex-wrap items-end justify-between gap-8">
            <Reveal>
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">
                Pricing
              </span>
              <h2 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">
                Simple prices. <span className="text-ember">Serious builds.</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="max-w-xs text-sm leading-relaxed text-parchment-faint">
                Every tier delivers the whole thing. Pick the pace that fits how you build.
              </p>
            </Reveal>
          </div>
        )}

        <div className={`grid grid-cols-1 gap-6 lg:grid-cols-3 ${hideHeader ? "" : "mt-16"}`}>
          {PRICING_TIERS.map((tier, index) => (
            <Reveal key={tier.name} delay={index * 90}>
              <div
                className={`flex h-full flex-col rounded-lg px-8 py-10 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 ${
                  tier.featured ? "bg-cream text-ink" : "border border-hairline-dark bg-ink-soft"
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3
                    className={`font-mono text-xs uppercase tracking-[0.25em] ${
                      tier.featured ? "text-ember" : "text-gilt"
                    }`}
                  >
                    {tier.name}
                  </h3>
                  {tier.featured ? (
                    <span className="rounded-sm bg-ember px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-cream">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <div className="mt-7 flex items-baseline gap-3">
                  <span className="font-serif text-6xl leading-none">{tier.price}</span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                      tier.featured ? "text-ink-faint" : "text-parchment-faint"
                    }`}
                  >
                    {tier.period}
                  </span>
                </div>
                <p
                  className={`mt-5 text-sm leading-relaxed ${
                    tier.featured ? "text-ink-muted" : "text-parchment-faint"
                  }`}
                >
                  {tier.blurb}
                </p>
                <ul
                  className={`mt-8 flex-1 border-t pt-7 ${
                    tier.featured ? "border-hairline-light" : "border-hairline-dark"
                  }`}
                >
                  {tier.features.map((feature) => (
                    <li key={feature} className="mt-3 flex items-baseline gap-3 first:mt-0">
                      <span aria-hidden="true" className="font-serif leading-none text-ember">
                        +
                      </span>
                      <span
                        className={`text-sm leading-relaxed ${
                          tier.featured ? "text-ink-muted" : "text-parchment"
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className={`mt-10 inline-block rounded-md text-center font-mono text-xs uppercase tracking-[0.2em] outline-none transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.97] ${
                    tier.featured
                      ? "bg-ember px-7 py-4 text-cream hover:bg-ember-strong focus-visible:bg-ember-strong"
                      : "border border-hairline-dark px-7 py-4 text-cream hover:border-ember hover:bg-ember focus-visible:border-ember focus-visible:bg-ember"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <p className="mt-12 font-mono text-[11px] uppercase tracking-[0.2em] text-parchment-faint">
            Early access: everything is free while we shape Mullion with you.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
