import { describe, expect, it } from "vitest";
import { medianOf } from "../median";

describe("medianOf", () => {
  it("returns 0 for an empty list", () => {
    expect(medianOf([])).toBe(0);
  });

  it("returns the value itself for a single element", () => {
    expect(medianOf([4.2])).toBe(4.2);
  });

  it("returns the middle element for odd lengths", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it("averages the two middle elements for even lengths", () => {
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not mutate its input", () => {
    const values = [3, 1, 2];
    medianOf(values);
    expect(values).toEqual([3, 1, 2]);
  });

  // The outlier rule is cost > 2x median — these pin the two cases the
  // cue must NOT fire for.
  it("a single run never outflags itself (x is not > 2x for positive x)", () => {
    const threshold = medianOf([0.5]) * 2;
    expect(0.5 > threshold).toBe(false);
  });

  it("all-equal costs never flag", () => {
    const threshold = medianOf([0.3, 0.3, 0.3]) * 2;
    expect(0.3 > threshold).toBe(false);
  });
});
