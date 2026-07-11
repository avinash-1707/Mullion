import Image from "next/image";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 px-6 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="flex flex-col justify-center pb-16 pt-36 lg:min-h-svh lg:pb-24">
          <span className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
            An AI build platform
          </span>
          <h1
            className="animate-reveal mt-7 font-serif text-[clamp(4.5rem,10vw,8.5rem)] leading-[0.92] tracking-[-0.01em] text-ember"
            style={{ animationDelay: "90ms" }}
          >
            From Idea
            <br />
            To Shipped.
          </h1>
          <p
            className="animate-reveal mt-8 max-w-[42ch] text-xl leading-[1.6] text-ink-muted"
            style={{ animationDelay: "180ms" }}
          >
            Describe what you want. Watch the plan take shape. Approve it, and the crew builds and
            delivers.
          </p>
          <div
            className="animate-reveal mt-12 flex flex-wrap items-center gap-8"
            style={{ animationDelay: "270ms" }}
          >
            <Link
              href="/sign-up"
              className="bg-ink px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember active:scale-[0.97]"
            >
              Start building
            </Link>
            <a
              href="#how-it-works"
              className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ink transition-colors duration-200 hover:text-ember"
            >
              See how it works
              <span
                aria-hidden="true"
                className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </a>
          </div>
        </div>

        {/* One artwork element, two layouts: in-flow full-bleed below the
            copy on mobile; at lg it goes absolute and bleeds to the
            viewport's right edge at full section height (the grid's empty
            second column reserves the space beneath it). Single element =
            single preload and an honest `sizes`. */}
        <div className="animate-reveal relative -mx-6 aspect-[4/5] sm:-mx-10 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:aspect-auto lg:w-[46vw]">
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
