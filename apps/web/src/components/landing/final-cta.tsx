import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="overflow-hidden bg-ink text-cream">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 items-center gap-16 px-6 py-28 sm:px-10 lg:grid-cols-12 lg:gap-10 lg:py-36">
        <div className="lg:col-span-7">
          <Reveal>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">
              The next build is yours
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="mt-8 max-w-2xl font-serif text-[clamp(2.75rem,5.5vw,4.5rem)] leading-[1.05]">
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

        {/* The artwork's near-black ground melts into the band; no frame. */}
        <Reveal variant="art" delay={140} className="lg:col-span-5">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[340px] lg:max-w-[420px] [mask-image:radial-gradient(ellipse_70%_70%_at_center,black_60%,transparent_98%)]">
            <Image
              src="/landing/cta-torchbearer.webp"
              alt="A blue sculpted hand raising a small brilliant golden star of light"
              fill
              sizes="(min-width: 1024px) 420px, 340px"
              className="object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
