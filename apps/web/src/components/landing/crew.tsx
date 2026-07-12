import Image from "next/image";
import { ChapterMark } from "./chapter-mark";
import { Reveal } from "./reveal";

const CREW = [
  {
    name: "Architect",
    role: "Plans the system and writes the decisions down.",
    image: "/landing/agent-architect.webp",
  },
  {
    name: "Coder",
    role: "Turns the plan into working code, piece by piece.",
    image: "/landing/agent-coder.webp",
  },
  {
    name: "Tester",
    role: "Proves every piece works before it moves on.",
    image: "/landing/agent-tester.webp",
  },
  {
    name: "Reviewer",
    role: "Checks the work, packages it, and hands it over.",
    image: "/landing/agent-reviewer.webp",
  },
] as const;

export function Crew() {
  return (
    <section id="agents" className="scroll-mt-10 bg-ink text-cream">
      <div className="mx-auto w-full max-w-[1320px] px-6 py-28 sm:px-10 lg:py-36">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <Reveal>
            <ChapterMark number="03" tone="dark" />
            <h2 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">Meet the crew.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="max-w-xs text-sm leading-relaxed text-parchment-faint">
              Four specialists work on every build, each with one job and one standard: your
              approval.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {CREW.map((member, index) => (
            <Reveal key={member.name} delay={index * 90}>
              <div className="group transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                  <Image
                    src={member.image}
                    alt={`Artwork for the ${member.name} agent`}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                  />
                </div>
                <h3 className="mt-5 font-mono text-sm uppercase tracking-[0.25em] text-cream">
                  {member.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-parchment-faint">{member.role}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
