// KAN-168 — pure quiet-hours math. Fixed UTC instants converted to IST
// (UTC+5:30) so every assertion is deterministic.
import { describe, it, expect } from "vitest";
import { isWithinQuietHours } from "./quiet-hours";

// 2026-07-07T18:30:00Z = 2026-07-08T00:00 IST (midnight).
const IST_MIDNIGHT = new Date("2026-07-07T18:30:00.000Z");
function atIst(hours: number, minutes = 0): Date {
  return new Date(IST_MIDNIGHT.getTime() + (hours * 60 + minutes) * 60_000);
}

describe("isWithinQuietHours", () => {
  it("is false when either bound is missing", () => {
    expect(isWithinQuietHours(null, "07:00", atIst(23))).toBe(false);
    expect(isWithinQuietHours("22:00", null, atIst(23))).toBe(false);
    expect(isWithinQuietHours(undefined, undefined, atIst(23))).toBe(false);
  });

  it("is false for a malformed bound", () => {
    expect(isWithinQuietHours("22:00", "7am", atIst(23))).toBe(false);
    expect(isWithinQuietHours("25:00", "07:00", atIst(23))).toBe(false);
  });

  it("is false for an equal start/end (zero-width window treated as off)", () => {
    expect(isWithinQuietHours("22:00", "22:00", atIst(22))).toBe(false);
  });

  it("handles a same-day window (e.g. 13:00-14:00)", () => {
    expect(isWithinQuietHours("13:00", "14:00", atIst(13, 30))).toBe(true);
    expect(isWithinQuietHours("13:00", "14:00", atIst(12, 59))).toBe(false);
    expect(isWithinQuietHours("13:00", "14:00", atIst(14, 0))).toBe(false); // end is exclusive
  });

  it("handles a window wrapping midnight (22:00 -> 07:00)", () => {
    expect(isWithinQuietHours("22:00", "07:00", atIst(23, 0))).toBe(true); // late night
    expect(isWithinQuietHours("22:00", "07:00", atIst(3, 0))).toBe(true); // early morning
    expect(isWithinQuietHours("22:00", "07:00", atIst(6, 59))).toBe(true); // just before end
    expect(isWithinQuietHours("22:00", "07:00", atIst(7, 0))).toBe(false); // end is exclusive
    expect(isWithinQuietHours("22:00", "07:00", atIst(12, 0))).toBe(false); // midday, outside
    expect(isWithinQuietHours("22:00", "07:00", atIst(21, 59))).toBe(false); // just before start
  });

  it("respects IST conversion at the UTC boundary", () => {
    // 18:29 UTC = 23:59 IST (still before midnight); 18:30 UTC = 00:00 IST.
    expect(isWithinQuietHours("22:00", "07:00", new Date("2026-07-07T18:29:00.000Z"))).toBe(true);
    expect(isWithinQuietHours("22:00", "07:00", new Date("2026-07-07T18:30:00.000Z"))).toBe(true);
  });
});
