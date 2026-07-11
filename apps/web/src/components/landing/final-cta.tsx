import Link from "next/link";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="bg-ink text-cream">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center px-6 py-32 text-center sm:px-10 lg:py-44">
        <Reveal>
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">
            The next build is yours
          </span>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="mt-8 max-w-3xl font-serif text-[clamp(2.75rem,6vw,4.75rem)] leading-[1.05]">
            Let&apos;s build something <span className="text-ember">extraordinary.</span>
          </h2>
        </Reveal>
        <Reveal delay={220}>
          <Link
            href="/sign-up"
            className="mt-14 inline-block bg-ember px-9 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97]"
          >
            Start building
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
