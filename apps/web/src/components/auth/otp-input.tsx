"use client";

import { useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  id?: string;
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

// Hand-rolled 6-box code input in the Input recipe (design-context.md
// "Forms") rather than shadcn's input-otp — that package isn't a
// dependency here and this app can't run a package-manager install
// mid-task, so a small controlled component is the pragmatic match. Each
// box holds exactly one digit; typing, backspacing, and pasting a full
// code all keep the boxes and the single `value` string in sync.
export function OtpInput({
  id,
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigitAt(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, length));
  }

  function focusBox(index: number) {
    inputRefs.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    // OS/browser OTP autofill can deliver the whole code as one change event
    // (bypassing onPaste) — distribute it across the boxes like a paste.
    if (cleaned.length > 1) {
      const next = digits.slice();
      let cursor = index;
      for (const char of cleaned) {
        if (cursor >= length) break;
        next[cursor] = char;
        cursor += 1;
      }
      onChange(next.join("").slice(0, length));
      focusBox(Math.min(cursor, length - 1));
      return;
    }
    const digit = cleaned.slice(-1);
    setDigitAt(index, digit);
    if (digit) focusBox(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (digits[index]) {
        setDigitAt(index, "");
      } else {
        setDigitAt(index - 1, "");
        focusBox(index - 1);
      }
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft") {
      focusBox(index - 1);
      event.preventDefault();
    }
    if (event.key === "ArrowRight") {
      focusBox(index + 1);
      event.preventDefault();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    const next = digits.slice();
    let cursor = index;
    for (const char of pasted) {
      if (cursor >= length) break;
      next[cursor] = char;
      cursor += 1;
    }
    onChange(next.join("").slice(0, length));
    focusBox(Math.min(cursor, length - 1));
  }

  return (
    <div role="group" aria-label="Verification code" className="flex gap-2 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          id={index === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          // Box 0 accepts the full code so one-time-code autofill isn't
          // truncated by the browser before handleChange can distribute it.
          maxLength={index === 0 ? length : 1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          aria-invalid={ariaInvalid}
          aria-describedby={index === 0 ? ariaDescribedBy : undefined}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          className={cn(
            "h-14 w-full min-w-0 rounded-md border border-hairline-light bg-transparent text-center font-mono text-xl text-ink outline-none transition-colors duration-200",
            "hover:border-ink-faint",
            "focus-visible:border-ember",
            "aria-invalid:border-ember",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
