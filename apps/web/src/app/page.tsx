import { MullionGrid } from "../components/mullion-grid";
import { HeroActions } from "../components/hero-actions";

const PHASES = [
  {
    step: "01",
    label: "Idea",
    copy: "Describe what you're building, in plain language.",
  },
  {
    step: "02",
    label: "Clarify",
    copy: "A capped set of multiple-choice questions removes ambiguity.",
  },
  {
    step: "03",
    label: "Plan",
    copy: "Agents draft architecture live — diagram and decision log, both editable.",
  },
  {
    step: "04",
    label: "Fork",
    copy: "Export the specs yourself, or let the agents build it end to end.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <MullionGrid />
        <div className="relative mx-auto flex max-w-4xl flex-col items-start gap-8 px-6 py-28 sm:py-36">
          <span
            className="animate-reveal font-mono text-xs uppercase tracking-[0.2em] text-accent"
          >
            Multi-agent build platform
          </span>
          <h1
            className="animate-reveal max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            An idea becomes an architecture, in view the whole time.
          </h1>
          <p
            className="animate-reveal max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg"
            style={{ animationDelay: "150ms" }}
          >
            Describe what you want to build. A capped set of questions clarifies scope, agents plan
            the system live in front of you, then you confirm and fork: export the specs, or let the
            build run end to end.
          </p>
          <div className="animate-reveal" style={{ animationDelay: "220ms" }}>
            <HeroActions />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {PHASES.map((phase) => (
          <div key={phase.step} className="px-6 py-10">
            <span className="font-mono text-xs text-accent">{phase.step}</span>
            <h2 className="mt-3 text-sm font-semibold text-fg">{phase.label}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{phase.copy}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto border-t border-border px-6 py-8">
        <p className="mx-auto max-w-6xl font-mono text-xs text-fg-faint">Mullion — Phase 0</p>
      </footer>
    </div>
  );
}
