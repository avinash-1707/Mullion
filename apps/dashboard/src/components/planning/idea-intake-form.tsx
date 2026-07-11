"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { SparkIcon } from "./icons";
import { useCreatePlanningSessionMutation } from "../../hooks/use-create-planning-session-mutation";

const MAX_LENGTH = 10_000;
const EXAMPLES = [
  "A URL shortener with per-link rate limiting and click analytics.",
  "A team knowledge base with markdown docs and full-text search.",
  "A waitlist app that emails signups a position number and referral link.",
];

// Phase 0 idea intake (01 §2) — a single prominent field, minimum ceremony.
// Anything sparser than a sentence is the Analyst's problem to clarify with
// MCQs, not this form's to gate on.
export function IdeaIntakeForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [touched, setTouched] = useState(false);
  const createSession = useCreatePlanningSessionMutation();

  const trimmed = idea.trim();
  const tooLong = idea.length > MAX_LENGTH;
  const isValid = trimmed.length > 0 && !tooLong;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isValid || createSession.isPending) return;

    createSession.mutate(trimmed, {
      onSuccess: ({ session, resumed }) => {
        // Both params are pure UX hints, not trust boundaries: `phase` lets
        // the destination page pick the matching skeleton instead of
        // guessing before its own snapshot fetch resolves; `resumed` drives
        // the one-time "resuming your active session" notice.
        const hints = new URLSearchParams({ phase: session.phase });
        if (resumed) hints.set("resumed", "1");
        router.push(`/sessions/${session.id}?${hints.toString()}`);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="border border-border bg-surface p-6 sm:p-8">
        <div className="flex items-center gap-2 text-gilt">
          <SparkIcon className="h-4 w-4" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em]">New session</span>
        </div>
        <label htmlFor="idea" className="mt-4 block font-serif text-2xl leading-snug tracking-tight text-fg">
          What do you want to build?
        </label>
        <p className="mt-1.5 text-sm text-fg-muted">
          One line or a short paragraph — an analyst will ask a few clarifying questions next.
        </p>

        <textarea
          id="idea"
          name="idea"
          rows={5}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={EXAMPLES[0]}
          maxLength={MAX_LENGTH + 500}
          className="transition-swift mt-5 w-full resize-none border border-border-strong bg-elevated px-4 py-3.5 text-[15px] leading-relaxed text-fg placeholder:text-fg-faint hover:border-fg-faint focus:border-ember focus:outline-none focus:ring-3 focus:ring-ember/20"
        />

        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-fg-faint">
            Try: <span className="text-fg-muted">&ldquo;{EXAMPLES[1]}&rdquo;</span>
          </p>
          <span className={`font-mono text-xs ${tooLong ? "text-danger" : "text-fg-faint"}`}>
            {idea.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
          </span>
        </div>

        {touched && !isValid ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {tooLong ? "That's a lot — trim it under 10,000 characters." : "Describe what you want to build first."}
          </p>
        ) : null}

        {createSession.isError ? (
          <p role="alert" className="mt-3 border-l-2 border-danger bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {createSession.error.message}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={createSession.isPending}>
            {createSession.isPending ? "Starting…" : "Start planning"}
          </Button>
        </div>
      </div>
    </form>
  );
}
