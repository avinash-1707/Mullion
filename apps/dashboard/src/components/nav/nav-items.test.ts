import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { isActive, type NavItem } from "./nav-items";

// Pure-function tests only, per CODING_STANDARDS §6 — no jsdom, no
// rendering, no testing-library. `Icon` is never invoked here, so a cast
// fixture is enough to satisfy the shape without pulling React into a
// plain .ts test file.
function makeItem(href: string, exact = false): NavItem {
  return {
    label: href,
    href,
    Icon: () => null as unknown as ReactElement,
    exact,
  };
}

describe("isActive", () => {
  it("matches the root route only exactly, never as a prefix", () => {
    const dashboard = makeItem("/", true);
    expect(isActive("/", dashboard)).toBe(true);
    expect(isActive("/builds", dashboard)).toBe(false);
    expect(isActive("/settings", dashboard)).toBe(false);
  });

  it("treats root as exact even if an item forgets to set `exact`", () => {
    const looseRoot = makeItem("/");
    expect(isActive("/builds", looseRoot)).toBe(false);
    expect(isActive("/", looseRoot)).toBe(true);
  });

  it("matches a nested route under a section but not a look-alike name", () => {
    const builds = makeItem("/builds");
    expect(isActive("/builds", builds)).toBe(true);
    expect(isActive("/builds/x", builds)).toBe(true);
    expect(isActive("/buildsy", builds)).toBe(false);
    expect(isActive("/build", builds)).toBe(false);
  });

  it("ignores a trailing slash on either side", () => {
    const builds = makeItem("/builds");
    expect(isActive("/builds/", builds)).toBe(true);
    expect(isActive("/builds/x/", builds)).toBe(true);
  });

  it("matches nested settings routes", () => {
    const settings = makeItem("/settings");
    expect(isActive("/settings", settings)).toBe(true);
    expect(isActive("/settings/x", settings)).toBe(true);
    expect(isActive("/other", settings)).toBe(false);
  });
});
