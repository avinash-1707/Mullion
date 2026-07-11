import Image from "next/image";
import { ChapterMark } from "./chapter-mark";
import { Reveal } from "./reveal";

const PHASES = [
  {
    step: "01",
    label: "Clarify",
    copy: "Answer a short set of pointed questions. They pin down what you actually want before anything is planned.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.33c-.72.28-.9.92-.9 1.67" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    step: "02",
    label: "Plan",
    copy: "Agents draw the architecture live in front of you. A diagram and a decision log, both yours to edit.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
        <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
        <rect x="9" y="14.5" width="6" height="6" rx="1" />
        <path d="M6.5 9.5v2.5h11V9.5M12 12v2.5" />
      </svg>
    ),
  },
  {
    step: "03",
    label: "Build",
    copy: "A crew of agents writes, tests, and reviews the code in an isolated workspace, step by step.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <path d="M8.5 8 4 12l4.5 4M15.5 8 20 12l-4.5 4M13.2 5.5l-2.4 13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    step: "04",
    label: "Deliver",
    copy: "The finished project arrives as a clean archive, or lands straight in your own GitHub.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
        <path d="M9.5 14.5 15 9m0 0h-4.2M15 9v4.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-10">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-28 sm:px-10 lg:py-36">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center lg:gap-10">
          <Reveal className="lg:col-span-2">
            <ChapterMark number="02" tone="light" />
          </Reveal>
          <Reveal variant="art" delay={80} className="lg:col-span-4">
            <div className="mx-auto max-w-[360px] border border-hairline-light p-3">
              <div className="relative aspect-square overflow-hidden">
                <Image
                  src="/landing/chapter-02-orrery.webp"
                  alt="A brass orrery floating in storm clouds, one ring turning into a technical blueprint drawing"
                  fill
                  sizes="(min-width: 1024px) 360px, 80vw"
                  className="object-cover"
                />
              </div>
            </div>
          </Reveal>
          <div className="lg:col-span-6 lg:pl-8">
            <Reveal delay={140}>
              <h2 className="max-w-md font-serif text-4xl leading-tight text-ember sm:text-5xl">
                Four steps. One clear path.
              </h2>
            </Reveal>
            <Reveal delay={220}>
              <p className="mt-8 max-w-md text-base leading-relaxed text-ink-muted">
                No black box, no endless back and forth. A build moves through four steps you can
                watch, question, and steer.
              </p>
            </Reveal>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 gap-y-12 border-t border-hairline-light pt-14 sm:grid-cols-2 sm:gap-x-12 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-hairline-light">
          {PHASES.map((phase, index) => (
            <Reveal
              key={phase.step}
              delay={index * 90}
              className="lg:px-10 lg:first:pl-0 lg:last:pr-0"
            >
              <div className="text-gilt">{phase.icon}</div>
              <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                {phase.step}
              </p>
              <h3 className="mt-2.5 font-serif text-xl text-ink">{phase.label}</h3>
              <p className="mt-3.5 max-w-[26ch] text-sm leading-relaxed text-ink-muted">
                {phase.copy}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
