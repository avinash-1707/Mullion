import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MullionMark } from "@/components/mullion-mark";

interface AuthShellProps {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
}

// Split auth layout: artwork panel left, form on cream right. The artwork
// swaps to the dedicated auth piece when it lands (same path, new file).
export function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  return (
    <div
      className="grid min-h-svh grid-cols-1 bg-cream text-ink lg:grid-cols-[1fr_1.1fr]"
      style={{ colorScheme: "light" }}
    >
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <Image
          src="/auth/auth-threshold.webp"
          alt=""
          fill
          priority
          sizes="45vw"
          className="object-cover"
        />
        <Link
          href="/"
          className="absolute left-10 top-8 flex items-center gap-2.5 text-cream outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-2xl tracking-tight">Mullion</span>
        </Link>
        <p
          aria-hidden="true"
          className="absolute bottom-10 left-10 font-mono text-[10px] uppercase tracking-[0.4em] text-gilt"
        >
          Idea meets execution
        </p>
      </div>

      <div className="flex flex-col px-6 py-6 sm:px-12">
        {/* Mobile-only wordmark; on desktop the artwork panel carries it and
            removing it from the flow keeps the form truly centered. */}
        <Link
          href="/"
          className="flex items-center gap-2.5 self-start text-ink outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember lg:hidden"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-2xl tracking-tight">Mullion</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-sm">
            <span className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-ember">
              {eyebrow}
            </span>
            <h1
              className="animate-reveal mt-4 font-serif text-3xl leading-[1.05] tracking-tight text-ink sm:text-4xl"
              style={{ animationDelay: "80ms" }}
            >
              {title}
            </h1>
            <p
              className="animate-reveal mt-3 text-base leading-relaxed text-ink-muted"
              style={{ animationDelay: "160ms" }}
            >
              {subtitle}
            </p>
            <div className="animate-reveal mt-7" style={{ animationDelay: "240ms" }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
