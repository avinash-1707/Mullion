import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReturnTo } from "./return-to";

// The open-redirect guard for the cross-app sign-in hand-off (ADR-64):
// returnTo comes off the query string, so every hostile shape must collapse
// to the dashboard root rather than navigate the user off-site.

const BASE = "https://app.mullion.com";

describe("resolveReturnTo", () => {
  it("defaults to the dashboard root when returnTo is absent or empty", () => {
    expect(resolveReturnTo(null, BASE)).toBe(BASE);
    expect(resolveReturnTo("", BASE)).toBe(BASE);
  });

  it("accepts an absolute same-origin deep link", () => {
    expect(resolveReturnTo("https://app.mullion.com/builds/abc123", BASE)).toBe(
      "https://app.mullion.com/builds/abc123",
    );
  });

  it("resolves a path-only value onto the dashboard origin", () => {
    expect(resolveReturnTo("/sessions/xyz?phase=architecture", BASE)).toBe(
      "https://app.mullion.com/sessions/xyz?phase=architecture",
    );
  });

  it("rejects a foreign absolute origin", () => {
    expect(resolveReturnTo("https://evil.example/phish", BASE)).toBe(BASE);
  });

  it("rejects a same-registrable-domain but different subdomain origin", () => {
    expect(resolveReturnTo("https://other.mullion.com/x", BASE)).toBe(BASE);
  });

  it("rejects a protocol-relative URL (//evil.example resolves cross-origin)", () => {
    expect(resolveReturnTo("//evil.example/phish", BASE)).toBe(BASE);
  });

  it("rejects javascript: and other non-http schemes", () => {
    expect(resolveReturnTo("javascript:alert(1)", BASE)).toBe(BASE);
    expect(resolveReturnTo("data:text/html,x", BASE)).toBe(BASE);
  });

  it("rejects an http downgrade of the dashboard origin", () => {
    expect(resolveReturnTo("http://app.mullion.com/builds/abc", BASE)).toBe(BASE);
  });

  it("works with a localhost dev base (port is part of the origin)", () => {
    const dev = "http://localhost:3001";
    expect(resolveReturnTo("/builds/abc", dev)).toBe("http://localhost:3001/builds/abc");
    expect(resolveReturnTo("http://localhost:3000/x", dev)).toBe(dev);
  });
});

// Regression guards for the classic open-redirect bypass shapes — the
// current URL-origin comparison defeats all of these; the tests exist so a
// future "simplification" to startsWith/includes can't reintroduce them.
describe("resolveReturnTo (adversarial)", () => {
  it("rejects userinfo @-authority tricks", () => {
    expect(resolveReturnTo("https://app.mullion.com@evil.example/x", BASE)).toBe(BASE);
    expect(resolveReturnTo("https://app.mullion.com:pw@evil.example/x", BASE)).toBe(BASE);
  });

  it("rejects a suffixed look-alike host", () => {
    expect(resolveReturnTo("https://app.mullion.com.evil.example/x", BASE)).toBe(BASE);
  });

  it("rejects backslash-obfuscated authorities", () => {
    expect(resolveReturnTo("/\\evil.example/x", BASE)).toBe(BASE);
    expect(resolveReturnTo("https:/\\evil.example/x", BASE)).toBe(BASE);
  });

  it("rejects the marketing origin itself (prevents a sign-in redirect loop)", () => {
    expect(resolveReturnTo("https://mullion.com/sign-in", BASE)).toBe(BASE);
  });
});

describe("redirectToApp", () => {
  const assign = vi.fn();

  async function loadFresh() {
    vi.resetModules();
    return await import("./return-to");
  }

  function stubWindow(search: string) {
    vi.stubGlobal("window", {
      location: { search, assign },
      addEventListener: vi.fn(),
    });
  }

  beforeEach(() => {
    assign.mockReset();
    stubWindow("");
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_URL", "https://app.mullion.com");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("decodes and honors a validated same-origin returnTo", async () => {
    const target = "https://app.mullion.com/builds/abc?x=1";
    stubWindow(`?returnTo=${encodeURIComponent(target)}`);
    const fresh = await loadFresh();
    fresh.redirectToApp();
    expect(assign).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("collapses an evil returnTo to the dashboard root", async () => {
    stubWindow(`?returnTo=${encodeURIComponent("https://evil.example/x")}`);
    const fresh = await loadFresh();
    fresh.redirectToApp();
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://app.mullion.com");
  });

  it("latches to one navigation across repeated calls", async () => {
    const fresh = await loadFresh();
    fresh.redirectToApp();
    fresh.redirectToApp();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("fails loud when NEXT_PUBLIC_DASHBOARD_URL is unset, without navigating", async () => {
    vi.stubEnv("NEXT_PUBLIC_DASHBOARD_URL", "");
    const fresh = await loadFresh();
    expect(() => fresh.redirectToApp()).toThrow(/NEXT_PUBLIC_DASHBOARD_URL/);
    expect(assign).not.toHaveBeenCalled();
  });
});
