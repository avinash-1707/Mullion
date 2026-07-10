import { EyeIcon } from "./icons";

// The one, consistent signal for "you didn't create this session" — every
// mutating control elsewhere is hidden rather than repeating this sentence
// (01 §9: one clear signal beats several scattered ones).
export function ViewOnlyBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-elevated px-4 py-2.5 sm:px-6">
      <EyeIcon className="h-4 w-4 shrink-0 text-fg-faint" />
      <p className="text-xs text-fg-muted">
        View only — created by someone else in your org. You can watch it plan, but only they can answer, edit, or
        confirm.
      </p>
    </div>
  );
}
