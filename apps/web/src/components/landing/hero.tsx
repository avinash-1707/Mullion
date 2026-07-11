import Image from "next/image";

import { HeroIdeaForm } from "./hero-idea-form";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 px-6 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="flex flex-col justify-center pb-16 pt-36 lg:min-h-svh lg:pb-24">
          <h1 className="animate-reveal font-hero text-[clamp(4rem,8vw,7rem)] leading-[0.95] tracking-[-0.005em] text-ember">
            From Idea
            <br />
            To Shipped.
          </h1>
          <p
            className="animate-reveal mt-6 max-w-[32ch] text-lg leading-[1.6] text-ink-muted"
            style={{ animationDelay: "90ms" }}
          >
            Describe what you want. Watch the plan take shape. Approve it, and the crew builds and
            delivers.
          </p>
          <HeroIdeaForm />
        </div>

        {/* One artwork element, two layouts: in-flow full-bleed below the
            copy on mobile; at lg it goes absolute and bleeds to the
            viewport's right edge at full section height (the grid's empty
            second column reserves the space beneath it). Single element =
            single preload and an honest `sizes`. */}
        <div
          className="animate-reveal-from-right relative -mx-6 aspect-[4/5] sm:-mx-10 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:aspect-auto lg:w-[46vw]"
          style={{ animationDelay: "120ms" }}
        >
          <Image
            src="/landing/hero-architect.webp"
            alt="A blue classical statue studying a small golden wireframe cube floating above its palm"
            fill
            priority
            sizes="(min-width: 1024px) 46vw, 100vw"
            className="object-cover object-center"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-14 right-7 hidden font-mono text-[10px] uppercase tracking-[0.4em] text-gilt [writing-mode:vertical-rl] lg:block"
          >
            Idea meets execution
          </span>
        </div>
      </div>
    </section>
  );
}
