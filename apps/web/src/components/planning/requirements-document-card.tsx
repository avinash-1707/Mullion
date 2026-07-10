import type { RequirementsDoc } from "@mullion/schemas";
import { Button } from "../ui/button";
import { CheckIcon } from "./icons";

interface RequirementsDocumentCardProps {
  doc: RequirementsDoc;
  version: number;
  isCreator: boolean;
  disabled: boolean;
  isProceeding: boolean;
  onEditAnswers: () => void;
  onProceed: () => void;
}

// The Requirements Document (01 §3 output) — a readable summary, never raw
// JSON, with assumptions visually flagged as the one part still open to
// correction before the architecture phase locks in around them.
export function RequirementsDocumentCard({
  doc,
  version,
  isCreator,
  disabled,
  isProceeding,
  onEditAnswers,
  onProceed,
}: RequirementsDocumentCardProps) {
  return (
    <div className="animate-reveal flex flex-col gap-7 rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.15em] text-fg-faint">Requirements · v{version}</span>
      </div>

      <p className="text-[15px] leading-relaxed text-fg">{doc.summary}</p>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Functional requirements</h2>
        <ul className="flex flex-col gap-2">
          {doc.functionalRequirements.map((req) => (
            <li key={req} className="flex items-start gap-2.5 text-sm text-fg">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>{req}</span>
            </li>
          ))}
        </ul>
      </section>

      {doc.nonFunctionalConstraints.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Constraints</h2>
          <ul className="flex flex-col gap-2">
            {doc.nonFunctionalConstraints.map((c) => (
              <li key={c} className="text-sm text-fg-muted">
                {c}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doc.assumptions.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Assumptions</h2>
            <span className="text-[11px] text-accent">editable — unconfirmed</span>
          </div>
          <ul className="flex flex-col gap-2">
            {doc.assumptions.map((a) => (
              <li
                key={a}
                className="rounded-lg border-l-2 border-accent bg-accent-soft px-3.5 py-2 text-sm text-fg"
              >
                {a}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">In v1</h2>
          <ul className="flex flex-col gap-1.5">
            {doc.scope.inV1.map((item) => (
              <li key={item} className="text-sm text-fg">
                {item}
              </li>
            ))}
          </ul>
        </div>
        {doc.scope.outOfV1.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Out of scope</h2>
            <ul className="flex flex-col gap-1.5">
              {doc.scope.outOfV1.map((item) => (
                <li key={item} className="text-sm text-fg-faint line-through decoration-fg-faint/60">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {isCreator ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
          <Button variant="secondary" onClick={onEditAnswers} disabled={disabled}>
            Edit answers
          </Button>
          <Button onClick={onProceed} disabled={disabled || isProceeding}>
            {isProceeding ? "Starting the plan…" : "Looks good — plan the architecture"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
