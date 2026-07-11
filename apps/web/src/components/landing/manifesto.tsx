import Image from "next/image";
import { ChapterMark } from "./chapter-mark";
import { Reveal } from "./reveal";

export function Manifesto() {
  return (
    <section className="bg-ink text-cream">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-14 px-6 py-28 sm:px-10 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-36">
        <Reveal className="lg:col-span-2">
          <ChapterMark number="01" tone="dark" />
        </Reveal>
        <Reveal variant="art" delay={80} className="lg:col-span-4">
          <div className="mx-auto max-w-[320px] rounded-t-[999px] border border-hairline-dark p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px]">
              <Image
                src="/landing/chapter-01-unbuilt-tower.webp"
                alt="A moonlit painting of an unfinished stone tower wrapped in scaffolding beneath a bright star"
                fill
                sizes="(min-width: 1024px) 320px, 80vw"
                className="object-cover"
              />
            </div>
          </div>
        </Reveal>
        <div className="lg:col-span-6 lg:pl-8">
          <Reveal delay={140}>
            <h2 className="max-w-md font-serif text-4xl leading-tight text-ember sm:text-5xl">
              We don&apos;t just generate code.
            </h2>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-8 max-w-md text-base leading-relaxed text-parchment">
              Every build starts with a plan you can see and shape. The structure, the choices, the
              reasons behind them. Nothing is decided behind your back, and nothing ships that you
              didn&apos;t approve.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-10 border-l border-hairline-dark pl-6 font-mono text-xs uppercase tracking-[0.2em] text-parchment-faint">
              <p>Plan-led.</p>
              <p className="mt-2">Spec-first.</p>
              <p className="mt-2">Delivery-driven.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
