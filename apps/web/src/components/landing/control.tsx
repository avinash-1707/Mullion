import Image from "next/image";
import { ChapterMark } from "./chapter-mark";
import { Reveal } from "./reveal";

const CONTROLS = [
  {
    title: "Shape the plan",
    copy: "Edit the diagram and the decisions before a single line of code is written.",
  },
  {
    title: "Approve the big calls",
    copy: "When the build reaches a real fork in the road, it stops and asks you first.",
  },
  {
    title: "Set the budget",
    copy: "Give the build a spending cap. It works within it, always.",
  },
] as const;

export function Control() {
  return (
    <section>
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-14 px-6 py-28 sm:px-10 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-36">
        <Reveal variant="art" className="lg:col-span-5">
          <div className="relative mx-auto aspect-[4/5] max-w-[440px]">
            <Image
              src="/chapter-04-winged-victory.webp"
              alt="A blue winged statue releasing a small golden shape into the air"
              fill
              sizes="(min-width: 1024px) 440px, 90vw"
              className="object-cover"
            />
          </div>
        </Reveal>
        <div className="lg:col-span-7 lg:pl-12">
          <Reveal>
            <ChapterMark number="04" tone="light" />
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-6 max-w-md font-serif text-4xl leading-tight text-ember sm:text-5xl">
              You stay in control.
            </h2>
          </Reveal>
          <div className="mt-10 max-w-lg">
            {CONTROLS.map((item, index) => (
              <Reveal
                key={item.title}
                delay={160 + index * 90}
                className="border-t border-hairline-light py-6 last:pb-0"
              >
                <h3 className="font-serif text-xl text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.copy}</p>
              </Reveal>
            ))}
          </div>
          <Reveal delay={460}>
            <blockquote className="mt-12 max-w-lg border-l-2 border-gilt pl-6">
              <p className="font-serif text-xl italic leading-relaxed text-ink">
                &ldquo;Well building hath three conditions: firmness, commodity, and
                delight.&rdquo;
              </p>
              <cite className="mt-3 block font-mono text-[10px] uppercase not-italic tracking-[0.3em] text-ink-faint">
                Henry Wotton
              </cite>
            </blockquote>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
