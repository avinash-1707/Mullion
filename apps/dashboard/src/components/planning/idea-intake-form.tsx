"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { SendIcon } from "./icons";
import { useCreatePlanningSessionMutation } from "../../hooks/use-create-planning-session-mutation";

const MAX_LENGTH = 10_000;
const EXAMPLES = [
  "A URL shortener with per-link rate limiting and click analytics.",
  "A team knowledge base with markdown docs and full-text search.",
  "A waitlist app that emails signups a position number and referral link.",
];
const TYPE_TICK_MS = 26;
// Ticks to hold a fully-typed example before deleting it (~3.6s) — long
// enough to actually read the sentence, not just watch it churn.
const HOLD_TICKS = 140;
// Ticks the field sits empty after a delete before the next example types
// (~0.8s) — the breath between thoughts.
const PAUSE_TICKS = 30;
// Deleting reads like a held backspace — faster than typing.
const DELETE_CHARS_PER_TICK = 2;
// Reduced motion: no typing, whole examples swap on a slow cadence (~3.4s).
const REDUCED_SWAP_TICKS = 130;

// Phase 0 idea intake (01 §2) — a single, minimal composer, Lovable-style:
// one rounded field, a compact toolbar living inside it (counter + submit),
// no separate header/label row above and no static "try this" caption below
// — the examples instead rotate through the placeholder itself. Anything
// sparser than a sentence is the Analyst's problem to clarify with MCQs,
// not this form's to gate on.
export function IdeaIntakeForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  // Only a submit attempt surfaces validation — clicking away from an empty
  // field is a non-event, not an error.
  const [attempted, setAttempted] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const createSession = useCreatePlanningSessionMutation();

  // Read inside the interval via a ref rather than restarting the interval
  // on every keystroke (which a plain `idea` dependency would do) — the
  // rotation only needs to pause once there's real content to show instead.
  const ideaRef = useRef(idea);
  useEffect(() => {
    ideaRef.current = idea;
  }, [idea]);

  // Typewriter loop, mirroring how a person uses an input: type the example
  // out, sit with it, backspace it away, start the next one. The machine
  // lives in locals and only syncs to state from inside the interval; the
  // whole loop freezes while the user has content — no background churn.
  // Reduced-motion users get whole examples swapping on a slow cadence.
  useEffect(() => {
    let index = 0;
    let count = 0;
    let heldTicks = 0;
    let phase: "typing" | "holding" | "deleting" | "pausing" = "typing";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => {
      if (ideaRef.current.length > 0) return;
      const example = EXAMPLES[index] ?? "";
      if (reduced) {
        setTypedCount(example.length);
        heldTicks += 1;
        if (heldTicks >= REDUCED_SWAP_TICKS) {
          heldTicks = 0;
          index = (index + 1) % EXAMPLES.length;
          setPlaceholderIndex(index);
        }
        return;
      }
      if (phase === "typing") {
        count += 1;
        setTypedCount(count);
        if (count >= example.length) phase = "holding";
      } else if (phase === "holding") {
        heldTicks += 1;
        if (heldTicks >= HOLD_TICKS) {
          heldTicks = 0;
          phase = "deleting";
        }
      } else if (phase === "deleting") {
        count = Math.max(0, count - DELETE_CHARS_PER_TICK);
        setTypedCount(count);
        if (count === 0) {
          phase = "pausing";
          index = (index + 1) % EXAMPLES.length;
          setPlaceholderIndex(index);
        }
      } else {
        heldTicks += 1;
        if (heldTicks >= PAUSE_TICKS) {
          heldTicks = 0;
          phase = "typing";
        }
      }
    }, TYPE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const trimmed = idea.trim();
  const tooLong = idea.length > MAX_LENGTH;
  const isValid = trimmed.length > 0 && !tooLong;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
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

  // Enter submits, Shift+Enter still makes a new line — the composer
  // convention this minimal a layout implies. Routes through the form's
  // own submit so validation/mutation stays in the one handler above.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <div className="transition-swift relative rounded-lg border border-border-strong bg-surface/60 backdrop-blur-md hover:border-fg-faint focus-within:border-ember">
        <label htmlFor="idea" className="sr-only">
          What do you want to build?
        </label>
        <textarea
          id="idea"
          name="idea"
          rows={3}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH + 500}
          aria-placeholder={EXAMPLES[placeholderIndex]}
          className="w-full resize-none bg-transparent px-5 pt-4 pb-3 text-[15px] leading-relaxed text-fg focus:outline-none"
        />
        {/* Faux placeholder: the native attribute can't animate, so the
            examples type themselves out in an overlay. `text-left` because
            the hero wraps this form in `text-center`. Hidden the moment
            there's content; pointer-events-none keeps clicks landing in the
            textarea underneath. */}
        {idea.length === 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-5 top-4 text-left text-[15px] leading-relaxed text-fg-faint"
          >
            {(EXAMPLES[placeholderIndex] ?? "").slice(0, typedCount)}
            <span className="animate-caret-blink ml-px inline-block h-[1.05em] w-px translate-y-[0.15em] bg-fg-faint" />
          </span>
        ) : null}

        {/* No separator or counter — the composer reads as one entity; the
            10k cap only surfaces as the submit-time error below. */}
        <div className="flex items-center justify-end px-4 pb-3">
          <Button
            type="submit"
            size="icon"
            disabled={createSession.isPending}
            aria-label={createSession.isPending ? "Starting…" : "Start planning"}
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {attempted && !isValid ? (
        <p role="alert" className="mt-2.5 text-sm text-danger">
          {tooLong ? "That's a lot - trim it under 10,000 characters." : "Describe what you want to build first."}
        </p>
      ) : null}

      {createSession.isError ? (
        <p role="alert" className="mt-2.5 rounded-r-md border-l-2 border-danger bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {createSession.error.message}
        </p>
      ) : null}
    </form>
  );
}
