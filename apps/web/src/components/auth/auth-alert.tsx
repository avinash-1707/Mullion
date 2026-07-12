interface AuthAlertProps {
  children: React.ReactNode;
  /** error: ember, matches every existing inline form error. notice: a
   * quieter gilt-marked confirmation for non-error states (OTP sent,
   * password reset) that shouldn't read as alarming. */
  tone?: "error" | "notice";
}

export function AuthAlert({ children, tone = "error" }: AuthAlertProps) {
  if (tone === "notice") {
    return (
      <p role="status" className="rounded-md border-l-2 border-gilt bg-gilt/10 px-4 py-3 text-sm text-ink-muted">
        {children}
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-md border-l-2 border-ember bg-ember/10 px-4 py-3 text-sm text-ember">
      {children}
    </p>
  );
}
