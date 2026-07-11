import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-nav";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { Reveal } from "@/components/landing/reveal";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple prices for serious builds. Every Mullion tier plans in the open, asks before big calls, and delivers the whole project.",
};

// Placeholder comparison, like the tiers themselves: to be edited by hand.
// `true` renders an ember plus, `false` a faint dash, a string prints as-is.
const COMPARISON: {
  feature: string;
  explorer: string | boolean;
  builder: string | boolean;
  studio: string | boolean;
}[] = [
  { feature: "Planning sessions", explorer: "1 at a time", builder: "1 at a time", studio: "Unlimited" },
  { feature: "Live diagram and decision log", explorer: true, builder: true, studio: true },
  { feature: "Spec export", explorer: true, builder: true, studio: true },
  { feature: "Automated build crew", explorer: false, builder: true, studio: true },
  { feature: "Active builds", explorer: false, builder: "1", studio: "3" },
  { feature: "Approval gates", explorer: false, builder: true, studio: true },
  { feature: "Delivery to GitHub or archive", explorer: false, builder: true, studio: true },
  { feature: "Build budget cap", explorer: false, builder: "Standard", studio: "Higher" },
  { feature: "Team workspace", explorer: false, builder: false, studio: true },
  { feature: "Priority build queue", explorer: false, builder: false, studio: true },
  { feature: "Support", explorer: "Community", builder: "Email", studio: "Priority" },
];

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span aria-label="Included" className="font-serif text-xl leading-none text-ember">
        +
      </span>
    );
  }
  if (value === false) {
    return (
      <span aria-label="Not included" className="text-ink-faint">
        &ndash;
      </span>
    );
  }
  return <span className="text-sm text-ink-muted">{value}</span>;
}

const PRICING_FAQ = [
  {
    question: "What counts as an active build?",
    answer:
      "A build that is currently being worked on by the crew. Planning sessions don't count. When a build is delivered, the slot frees up right away.",
  },
  {
    question: "Can I switch tiers?",
    answer:
      "Yes, any time. Upgrades apply immediately. Downgrades apply at the start of the next billing period, and nothing in progress is interrupted.",
  },
  {
    question: "What happens when early access ends?",
    answer:
      "You will get notice well ahead of time, and anything you built stays yours. Early access users keep a discount on whichever tier they pick.",
  },
  {
    question: "Do I need a card to start?",
    answer: "No. During early access everything is free, and no payment details are asked for.",
  },
] as const;

export default function PricingPage() {
  return (
    <div className="bg-cream text-ink" style={{ colorScheme: "light" }}>
      <LandingNav />

      {/* Page header: cream band under the transparent nav. */}
      <section className="mx-auto w-full max-w-[1200px] px-6 pb-20 pt-40 sm:px-10 lg:pb-24">
        <span className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
          Pricing
        </span>
        <h1
          className="animate-reveal mt-8 max-w-2xl font-serif text-5xl leading-[1.02] tracking-tight text-ember sm:text-6xl"
          style={{ animationDelay: "90ms" }}
        >
          Pay for the pace, not the platform.
        </h1>
        <p
          className="animate-reveal mt-8 max-w-md text-lg leading-relaxed text-ink-muted"
          style={{ animationDelay: "180ms" }}
        >
          Every tier delivers the whole thing. The only difference is how much you build at once.
        </p>
      </section>

      <Pricing hideHeader />

      {/* Feature comparison */}
      <section>
        <div className="mx-auto w-full max-w-[1200px] px-6 py-28 sm:px-10 lg:py-36">
          <Reveal>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
              Compare
            </span>
            <h2 className="mt-6 max-w-md font-serif text-4xl leading-tight text-ink sm:text-5xl">
              Tier by tier, side by side.
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-16 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline-light">
                  <th scope="col" className="w-[40%] pb-5" aria-label="Feature" />
                  <th
                    scope="col"
                    className="pb-5 text-center font-mono text-xs font-normal uppercase tracking-[0.25em] text-ink-faint"
                  >
                    Explorer
                  </th>
                  <th
                    scope="col"
                    className="bg-ink/[0.04] px-4 pb-5 text-center font-mono text-xs font-normal uppercase tracking-[0.25em] text-ember"
                  >
                    Builder
                  </th>
                  <th
                    scope="col"
                    className="pb-5 text-center font-mono text-xs font-normal uppercase tracking-[0.25em] text-ink-faint"
                  >
                    Studio
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-hairline-light">
                    <th scope="row" className="py-5 pr-6 font-serif text-lg font-normal text-ink">
                      {row.feature}
                    </th>
                    <td className="py-5 text-center">
                      <ComparisonCell value={row.explorer} />
                    </td>
                    <td className="bg-ink/[0.04] px-4 py-5 text-center">
                      <ComparisonCell value={row.builder} />
                    </td>
                    <td className="py-5 text-center">
                      <ComparisonCell value={row.studio} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* Pricing questions */}
      <section className="bg-ink text-cream">
        <div className="mx-auto w-full max-w-3xl px-6 py-28 sm:px-10 lg:py-36">
          <Reveal>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">
              Billing questions
            </span>
            <h2 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">
              The fine print, unfolded.
            </h2>
          </Reveal>
          <Reveal delay={120} className="mt-14">
            <Faq items={[...PRICING_FAQ]} tone="dark" />
          </Reveal>
        </div>
      </section>

      <FinalCta />
      <LandingFooter />
    </div>
  );
}
