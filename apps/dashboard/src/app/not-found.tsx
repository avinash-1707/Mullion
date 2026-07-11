import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Product-surface 404: dark theme, no marketing artwork — a wrong URL
// inside the signed-in app just needs a way back to the dashboard.
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-fg-faint">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">
        This page doesn&apos;t exist
      </h1>
      <p className="max-w-md text-sm text-fg-muted">
        The link may be stale, or the session or build it pointed at was removed.
      </p>
      <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
