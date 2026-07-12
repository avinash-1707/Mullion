interface FormNoteProps {
  children: React.ReactNode;
  /** error: the danger token (functional, never themed to brand).
   * success: a quiet reveal in fg-muted — no dedicated "success" copy
   * treatment exists yet for inline confirmations, and a loud one would
   * fight this surface's "legibility over flourish" rule. */
  tone?: "error" | "success";
}

export function FormNote({ children, tone = "error" }: FormNoteProps) {
  if (tone === "success") {
    return (
      <p role="status" className="animate-reveal text-sm text-fg-muted">
        {children}
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-r-md border-l-2 border-danger bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {children}
    </p>
  );
}
