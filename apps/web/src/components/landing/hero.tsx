import Image from "next/image";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 px-6 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="flex flex-col justify-center pb-16 pt-36 lg:min-h-svh lg:pb-24">
          <span className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
            An AI build platform
          </span>
          <h1
            className="animate-reveal mt-8 font-serif text-[clamp(3.25rem,7.5vw,5.75rem)] leading-[0.98] tracking-tight text-ember"
            style={{ animationDelay: "90ms" }}
          >
            From idea
            <br />
            to shipped.
          </h1>
          <p
            className="animate-reveal mt-9 max-w-md text-lg leading-relaxed text-ink-muted"
            style={{ animationDelay: "180ms" }}
          >
            Describe what you want to build. Mullion asks the right questions, plans the whole
            thing in front of you, then builds and delivers it with your approval at every turn.
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

        {/* Mobile: artwork flows below the copy, full-bleed. */}
        <div className="animate-reveal relative -mx-6 aspect-[4/5] sm:-mx-10 lg:hidden">
          <Image
            src="/hero-architect.webp"
            alt="A blue classical statue studying a small golden wireframe cube floating above its palm"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
      </div>

      {/* Desktop: artwork bleeds to the viewport's right edge, full height,
          outside the content container. The grid's empty second column
          reserves the space beneath it. */}
      <div className="animate-reveal absolute inset-y-0 right-0 hidden w-[46vw] lg:block">
        <Image
          src="/hero-architect.webp"
          alt="A blue classical statue studying a small golden wireframe cube floating above its palm"
          fill
          priority
          sizes="46vw"
          className="object-cover object-center"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-14 right-7 font-mono text-[10px] uppercase tracking-[0.4em] text-gilt [writing-mode:vertical-rl]"
        >
          Idea meets execution
        </span>
      </div>
    </section>
  );
}
