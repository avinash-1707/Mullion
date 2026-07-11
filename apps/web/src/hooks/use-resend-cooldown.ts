"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_SECONDS = 30;

// Shared "resend code" throttle for the OTP flows (verify-email,
// forgot-password → reset-password). Purely a client-side UX guard against
// button-mashing — the server's own rate limit is the real backstop.
export function useResendCooldown(seconds: number = DEFAULT_SECONDS) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function start() {
    setRemaining(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  return { remaining, start, canResend: remaining === 0 };
}
