import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeExpiry } from "../format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelativeExpiry", () => {
  function at(now: string, expiry: string): string {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    return formatRelativeExpiry(expiry);
  }

  it("reports lapsed and sub-hour windows", () => {
    expect(at("2026-07-12T12:00:00Z", "2026-07-12T11:59:59Z")).toBe("Expired");
    expect(at("2026-07-12T12:00:00Z", "2026-07-12T12:00:00Z")).toBe("Expired");
    expect(at("2026-07-12T12:00:00Z", "2026-07-12T12:20:00Z")).toBe("Expires in <1h");
  });

  it("rounds hours inside a day, days beyond it", () => {
    expect(at("2026-07-12T12:00:00Z", "2026-07-12T18:00:00Z")).toBe("Expires in 6h");
    expect(at("2026-07-12T12:00:00Z", "2026-07-13T11:00:00Z")).toBe("Expires in 23h");
    expect(at("2026-07-12T12:00:00Z", "2026-07-14T12:00:00Z")).toBe("Expires in 2d");
  });
});
