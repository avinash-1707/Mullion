"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

// Enough to sketch a real sentence, short enough not to be an essay.
const IDEA_MAX_LENGTH = 500;

// Replaces the hero's old two-CTA row with a chat-style idea composer.
// The typed idea is deliberately NOT persisted or passed along — no query
// param, no storage; the composer is an invitation to start, and sign-up
// begins clean. An empty submit still goes to /sign-up, so this never
// blocks entry.
export function HeroIdeaForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/sign-up");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Composer convention: Enter sends, Shift+Enter writes a new line.
    // isComposing guards the Enter keystroke that confirms an IME candidate
    // (e.g. finishing a Japanese/Chinese composition) from firing a submit.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="animate-reveal-invite mt-12 w-full max-w-[42rem] rounded-lg border border-hairline-light bg-cream-deep transition-colors duration-200 focus-within:border-ink/30">
      <form onSubmit={handleSubmit} className="relative">
        <label htmlFor="hero-idea" className="sr-only">
          Describe your project idea
        </label>
        <textarea
          id="hero-idea"
          name="idea"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={IDEA_MAX_LENGTH}
          placeholder="Describe what you want to build…"
          className="block w-full resize-none overflow-y-auto bg-transparent px-6 pt-6 pb-16 text-lg leading-relaxed text-ink outline-none placeholder:text-ink-faint sm:text-xl"
        />
        {/* Floats inside the same surface, chat-composer style, instead of
            sitting in a separated footer row - the textarea's own pb-16
            reserves the corner so typed text never runs under it. */}
        <button
          type="submit"
          className="group/submit absolute bottom-4 right-4 flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-cream outline-none transition-[background-color,transform] duration-200 hover:bg-ember focus-visible:bg-ember active:scale-[0.97]"
        >
          Start building
          <span
            aria-hidden="true"
            className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/submit:translate-x-1 group-focus-visible/submit:translate-x-1"
          >
            &rarr;
          </span>
        </button>
      </form>
    </div>
  );
}
