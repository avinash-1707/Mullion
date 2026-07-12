import type { ReactElement } from "react";
// Relative (not "@/") import: vitest has no alias config, and this module
// must stay importable from plain .ts tests (see nav-items.test.ts).
import { BuildIcon, DashboardIcon, SettingsIcon } from "../planning/icons";

// Shared by AppSidebar (desktop rail) and MobileNav (drawer) so the two
// surfaces can never drift into different routes/labels/icons. `exact`
// distinguishes the root route (which would otherwise prefix-match every
// path) from section roots like /builds, which should stay active for
// their whole subtree.
export interface NavItem {
  label: string;
  href: string;
  Icon: (p: { className?: string }) => ReactElement;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", Icon: DashboardIcon, exact: true },
  { label: "Builds", href: "/builds", Icon: BuildIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

// Strips a single trailing slash (but never collapses "/" itself) so
// "/builds/" and "/builds" compare equal.
function normalize(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

// Pure so it's testable without rendering anything (see nav-items.test.ts).
// Prefix matches are segment-bounded — `/builds` matches `/builds/x` but
// not `/buildsy` — by requiring the next character after the shared
// prefix to be a "/", never comparing raw string prefixes.
export function isActive(pathname: string, item: NavItem): boolean {
  const path = normalize(pathname);
  const href = normalize(item.href);

  // Root is always an exact match regardless of `item.exact`: prefix
  // matching "/" would light up every route in the app.
  if (item.exact || href === "/") {
    return path === href;
  }

  return path === href || path.startsWith(`${href}/`);
}
