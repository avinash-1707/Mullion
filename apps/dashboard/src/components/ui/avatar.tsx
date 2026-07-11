interface AvatarProps {
  name: string;
  email: string;
  /** https URL from the auth session (Google/GitHub picture or user-set). */
  image?: string | null | undefined;
  className?: string;
}

function initial(name: string, email: string): string {
  const source = name.trim() || email;
  return source.slice(0, 1).toUpperCase() || "?";
}

// Renders the session avatar with an initial fallback. Only https URLs are
// rendered — the API enforces this on write, but the check is repeated here
// so a stale/legacy value can never reach an <img src>.
export function Avatar({ name, email, image, className = "h-8 w-8" }: AvatarProps) {
  const src = image?.trim() ?? "";
  const showImage = /^https:\/\//i.test(src);

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden border border-border bg-elevated`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote user avatar, not a static/optimizable asset
        <img src={src} alt={`${name.trim() || email} avatar`} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <span className="select-none font-serif text-sm text-fg-muted">{initial(name, email)}</span>
      )}
    </span>
  );
}
