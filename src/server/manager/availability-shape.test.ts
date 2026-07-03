import { describe, it, expect } from "vitest";
import { clipDateRange } from "./availability-shape";

describe("clipDateRange", () => {
  it("returns the full month range when no filter is set", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("narrows the start when fromFilter falls inside the month", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31", "2026-07-10")).toEqual({ from: "2026-07-10", to: "2026-07-31" });
  });

  it("narrows the end when toFilter falls inside the month", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31", undefined, "2026-07-20")).toEqual({
      from: "2026-07-01",
      to: "2026-07-20",
    });
  });

  it("narrows both ends when both filters fall inside the month", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31", "2026-07-10", "2026-07-20")).toEqual({
      from: "2026-07-10",
      to: "2026-07-20",
    });
  });

  it("ignores a fromFilter before the month start (never widens the range)", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31", "2026-06-15")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("ignores a toFilter after the month end (never widens the range)", () => {
    expect(clipDateRange("2026-07-01", "2026-07-31", undefined, "2026-08-15")).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("produces an empty (from > to) range when the filter window doesn't overlap the month at all", () => {
    const { from, to } = clipDateRange("2026-07-01", "2026-07-31", "2026-08-01", "2026-08-31");
    expect(from > to).toBe(true);
  });
});
