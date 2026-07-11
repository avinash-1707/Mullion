"use client";

import { useState } from "react";
import type { DeliveryRef } from "../../lib/build-stream";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon, WarningIcon } from "../planning/icons";

interface BuildDeliveryPanelProps {
  deliveries: DeliveryRef[];
  isPartial: boolean;
}

// Named `refValue`, not `ref` — React (since 19) treats a `ref` prop
// specially on function components for actual DOM/instance refs, so a plain
// string prop needs a different name to avoid colliding with that.
function CopyRefButton({ refValue }: { refValue: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(refValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Insecure context / permission denied — the ref stays visible for a
      // manual copy; don't leak an unhandled rejection.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="transition-swift inline-flex shrink-0 items-center gap-1.5 px-1.5 py-0.5 text-fg-muted hover:bg-elevated hover:text-fg"
      aria-label="Copy reference"
    >
      {copied ? (
        <CheckIcon key="check" className="h-3.5 w-3.5 animate-reveal text-accent" />
      ) : (
        <CopyIcon key="copy" className="h-3.5 w-3.5 animate-reveal" />
      )}
    </button>
  );
}

// Only render an agent-authored ref as a clickable link when it's an https
// URL on an expected delivery host (ADR-04/15: GitHub push only) — a
// prompt-injected ref to an arbitrary host renders as inert copyable text,
// not a link, so the trusted Delivery panel can't become a phishing vector
// (Phase 3 audit).
const DELIVERY_LINK_HOSTS = new Set(["github.com", "www.github.com"]);

function isTrustedDeliveryLink(ref: string): boolean {
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return false;
  }
  return url.protocol === "https:" && DELIVERY_LINK_HOSTS.has(url.hostname);
}

function DeliveryRow({ delivery }: { delivery: DeliveryRef }) {
  const isLink = isTrustedDeliveryLink(delivery.ref);
  return (
    <div className="flex items-center gap-2.5 border border-border bg-surface px-3.5 py-2.5">
      <span className="shrink-0 bg-elevated px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {delivery.kind}
      </span>
      {isLink ? (
        <a
          href={delivery.ref}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-swift flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-accent hover:text-accent-strong"
        >
          <span className="truncate">{delivery.ref}</span>
          <ExternalIcon className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{delivery.ref}</span>
      )}
      {!isLink ? <CopyRefButton refValue={delivery.ref} /> : null}
    </div>
  );
}

// Shown once delivery_result arrives, or the run is terminal (02 §3 shipping
// phase). ADR-33: a partial delivery gets the identical panel — same rows,
// same copy/link affordances — just a note explaining why, never a
// degraded or hidden alternative.
export function BuildDeliveryPanel({ deliveries, isPartial }: BuildDeliveryPanelProps) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <DownloadIcon className="h-4 w-4 text-accent-strong" />
        <h2 className="font-serif text-xl leading-tight text-fg">Delivered</h2>
      </div>

      {isPartial ? (
        <div className="flex items-start gap-2 border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-xs text-accent-strong">
          <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Partial delivery — the build ended before every task completed. What was built ships anyway.</p>
        </div>
      ) : null}

      {deliveries.length === 0 ? (
        <p className="text-xs text-fg-faint">No deliverables were produced.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {deliveries.map((delivery, index) => (
            <DeliveryRow key={`${delivery.kind}-${index}`} delivery={delivery} />
          ))}
        </div>
      )}
    </div>
  );
}
