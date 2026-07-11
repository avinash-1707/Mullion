import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// auth-redirect latches at module level (one navigation per page lifetime),
// so every test imports a fresh copy of the module. The stub carries
// addEventListener because the module registers a bfcache pageshow handler
// at load.
async function loadFresh() {
  vi.resetModules();
  return await import("./auth-redirect");
}

const assign = vi.fn();

function stubWindow(href: string) {
  vi.stubGlobal("window", {
    location: { href, assign },
    addEventListener: vi.fn(),
  });
}

beforeEach(() => {
  assign.mockReset();
  stubWindow("http://localhost:3001/builds/abc?tab=timeline");
  vi.stubEnv("NEXT_PUBLIC_WEB_URL", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("redirectToSignIn", () => {
  it("navigates to the web app's sign-in carrying the current URL as returnTo", async () => {
    const { redirectToSignIn } = await loadFresh();
    redirectToSignIn();
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `http://localhost:3000/sign-in?returnTo=${encodeURIComponent(
        "http://localhost:3001/builds/abc?tab=timeline",
      )}`,
    );
  });

  it("percent-encodes the full href so nothing is smuggled onto /sign-in", async () => {
    const href = "http://localhost:3001/b?next=https://evil.example&x=1#frag";
    stubWindow(href);
    const { redirectToSignIn } = await loadFresh();
    redirectToSignIn();
    const url = assign.mock.calls[0]?.[0] as string;
    expect(url).toBe(`http://localhost:3000/sign-in?returnTo=${encodeURIComponent(href)}`);
    // Exactly one query separator — the deep link's own ?/&/# ride inside
    // the encoded value, never as parameters of /sign-in itself.
    expect(url.indexOf("?")).toBe(url.lastIndexOf("?"));
    expect(url).not.toContain("#");
  });

  it("latches: repeated calls (auth gate + 401 funnel firing together) navigate once", async () => {
    const { redirectToSignIn, redirectToMarketing } = await loadFresh();
    redirectToSignIn();
    redirectToSignIn();
    redirectToMarketing();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("fails loud when NEXT_PUBLIC_WEB_URL is missing, without stranding later calls", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "");
    const { redirectToSignIn, redirectToMarketing } = await loadFresh();
    expect(() => redirectToSignIn()).toThrow(/NEXT_PUBLIC_WEB_URL/);
    // The latch means "navigation happened", not "we tried" — a failed
    // attempt must not swallow the next one.
    expect(() => redirectToMarketing()).toThrow(/NEXT_PUBLIC_WEB_URL/);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("redirectToMarketing", () => {
  it("navigates to the marketing root", async () => {
    const { redirectToMarketing } = await loadFresh();
    redirectToMarketing();
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost:3000");
  });
});
