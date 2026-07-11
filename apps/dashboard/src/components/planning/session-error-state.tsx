import Link from "next/link";
import { buttonVariants } from "../ui/button";
import { WarningIcon } from "./icons";

interface SessionErrorStateProps {
  title: string;
  message: string;
}

// One shared shape for every "can't show the real thing" case on this page —
// not found, abandoned, generic load failure — so they read as one family
// instead of three ad hoc dead ends.
export function SessionErrorState({ title, message }: SessionErrorStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="flex h-11 w-11 items-center justify-center bg-danger-soft text-danger">
        <WarningIcon className="h-5 w-5" />
      </span>
      <h1 className="font-serif text-2xl leading-snug text-fg">{title}</h1>
      <p className="text-sm text-fg-muted">{message}</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        Back to dashboard
      </Link>
    </div>
  );
}
