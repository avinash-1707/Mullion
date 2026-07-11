import type { IconType } from "react-icons";
import { LuGithub } from "react-icons/lu";

interface IconProps {
  className?: string;
}

const base = "h-4 w-4";
const strokeWidth = 1.75;

// Same wrap as components/planning/icons.tsx: one shared size/stroke/
// aria-hidden treatment so this section's glyphs read as the same hand as
// the rest of the product's Lucide-sourced iconography, not a second family.
function wrapIcon(Icon: IconType, displayName: string) {
  function IconComponent({ className = base }: IconProps) {
    return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  }
  IconComponent.displayName = displayName;
  return IconComponent;
}

export const GithubIcon = wrapIcon(LuGithub, "GithubIcon");

// Lucide has no Google mark — a 4-color logo doesn't fit its single-stroke
// vocabulary — so this is a hand-rolled outline glyph at the same
// size/weight/currentColor treatment, to read as part of this icon set
// rather than a dropped-in brand asset.
export function GoogleIcon({ className = base }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.23c0-.7-.06-1.38-.18-2.02H12v3.83h5.02a4.3 4.3 0 0 1-1.86 2.83v2.3h3.02c1.76-1.63 2.82-4.02 2.82-6.94Z" />
      <path d="M12 21c2.52 0 4.63-.83 6.18-2.26l-3.02-2.3c-.84.56-1.9.9-3.16.9-2.43 0-4.48-1.64-5.22-3.84H3.66v2.38A9.5 9.5 0 0 0 12 21Z" />
      <path d="M6.78 13.5a5.6 5.6 0 0 1 0-3.5V7.62H3.66a9.5 9.5 0 0 0 0 8.26l3.12-2.38Z" />
      <path d="M12 5.66c1.37 0 2.6.47 3.57 1.4l2.68-2.68C16.62 2.86 14.5 2 12 2A9.5 9.5 0 0 0 3.66 7.62l3.12 2.38c.74-2.2 2.79-3.84 5.22-3.84Z" />
    </svg>
  );
}
