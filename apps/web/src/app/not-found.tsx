import Image from "next/image";
import Link from "next/link";
import { MullionMark } from "@/components/mullion-mark";

// Global 404. Sits directly in the root layout (no group chrome), styled
// as part of the marketing world: the unbuilt tower is the one page that
// never made it out of planning.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col bg-ink text-cream" style={{ colorScheme: "dark" }}>
      <div className="mx-auto flex h-24 w-full max-w-[1320px] items-center px-6 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-cream transition-colors duration-200 hover:text-ember"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-2xl tracking-tight">Mullion</span>
        </Link>
      </div>

      <div className="mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-14 px-6 pb-24 pt-8 sm:px-10 lg:grid-cols-12 lg:gap-10">
        <div className="animate-reveal mx-auto w-full max-w-[300px] lg:col-span-4">
          <div className="rounded-t-[999px] border border-hairline-dark p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px]">
              <Image
                src="/landing/chapter-01-unbuilt-tower.webp"
                alt="A moonlit painting of an unfinished stone tower wrapped in scaffolding"
                fill
                priority
                sizes="300px"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 lg:pl-8">
          <p
            className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-gilt"
            style={{ animationDelay: "80ms" }}
          >
            Error 404
          </p>
          <h1
            className="animate-reveal mt-6 max-w-xl font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl"
            style={{ animationDelay: "160ms" }}
          >
            This page was <span className="text-ember">never built.</span>
          </h1>
          <p
            className="animate-reveal mt-8 max-w-md text-lg leading-relaxed text-parchment-faint"
            style={{ animationDelay: "240ms" }}
          >
            It isn&apos;t in the diagram and it never made the decision log. Back to the drawing
            board.
          </p>
          <div
            className="animate-reveal mt-12 flex flex-wrap items-center gap-6"
            style={{ animationDelay: "320ms" }}
          >
            <Link
              href="/"
              className="bg-ember px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97]"
            >
              Back to home
            </Link>
            <Link
              href="/sign-up"
              className="border border-hairline-dark px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,border-color,transform] duration-200 hover:border-ember hover:bg-ember active:scale-[0.97]"
            >
              Start building
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
