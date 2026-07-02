import { describe, it, expect } from "vitest";
import { buildForecastPoints } from "./capacity-forecast-shape";
import type { RangeDayAvailability } from "./availability";

// Minimal RangeDayAvailability factory — only the fields buildForecastPoints
// reads need to vary per test; the rest default to a normal 4-headcount
// working day with nobody out, matching getAvailabilityForRange's own shape.
function rangeDay(overrides: Partial<RangeDayAvailability> & Pick<RangeDayAvailability, "date">): RangeDayAvailability {
  return {
    isWeekend: false,
    isHoliday: false,
    holidayName: "",
    isWorkingDay: true,
    headcount: 4,
    onLeave: 0,
    onLeaveApproved: 0,
    onWfh: 0,
    availableCount: 4,
    availablePct: 100,
    availableCountApproved: 4,
    availablePctApproved: 100,
    ...overrides,
  };
}

describe("buildForecastPoints", () => {
  it("shows a known future APPROVED-leave cluster as a dip on exactly the affected dates, in both series", () => {
    // A 3-day approved-leave cluster (2 of 4 headcount out) mid-window;
    // the days either side stay at full capacity.
    const days = [
      rangeDay({ date: "2026-07-13" }), // before the cluster — unaffected
      rangeDay({
        date: "2026-07-14",
        onLeave: 2,
        onLeaveApproved: 2,
        availableCount: 2,
        availablePct: 50,
        availableCountApproved: 2,
        availablePctApproved: 50,
      }),
      rangeDay({
        date: "2026-07-15",
        onLeave: 2,
        onLeaveApproved: 2,
        availableCount: 2,
        availablePct: 50,
        availableCountApproved: 2,
        availablePctApproved: 50,
      }),
      rangeDay({
        date: "2026-07-16",
        onLeave: 2,
        onLeaveApproved: 2,
        availableCount: 2,
        availablePct: 50,
        availableCountApproved: 2,
        availablePctApproved: 50,
      }),
      rangeDay({ date: "2026-07-17" }), // after the cluster — unaffected
    ];

    const points = buildForecastPoints(days);

    // The dip lands on exactly 07-14..07-16 — not the neighbouring days.
    const dipDates = points.filter((p) => p.availablePctApproved !== null && p.availablePctApproved < 100).map((p) => p.date);
    expect(dipDates).toEqual(["2026-07-14", "2026-07-15", "2026-07-16"]);

    for (const d of ["2026-07-14", "2026-07-15", "2026-07-16"]) {
      const p = points.find((pt) => pt.date === d)!;
      expect(p.availablePctApproved).toBe(50);
      // No pending requests in this fixture — the at-risk series matches the confirmed one exactly.
      expect(p.availablePctWithPending).toBe(50);
      expect(p.onLeavePending).toBe(0);
    }

    expect(points.find((p) => p.date === "2026-07-13")!.availablePctApproved).toBe(100);
    expect(points.find((p) => p.date === "2026-07-17")!.availablePctApproved).toBe(100);
  });

  it("shows a PENDING (not-yet-approved) request only in the at-risk series, never the confirmed one", () => {
    // 1 of 4 headcount has a pending (not approved) request this day.
    const d = rangeDay({
      date: "2026-07-20",
      onLeave: 1, // combined approved+pending total
      onLeaveApproved: 0, // nothing approved yet
      availableCount: 3,
      availablePct: 75,
      availableCountApproved: 4, // confirmed figure is unaffected
      availablePctApproved: 100,
    });

    const [point] = buildForecastPoints([d]);

    // Confirmed series: untouched by the pending request.
    expect(point.availableApproved).toBe(4);
    expect(point.availablePctApproved).toBe(100);
    expect(point.onLeaveApproved).toBe(0);

    // At-risk series: reflects the pending request's potential impact.
    expect(point.availableWithPending).toBe(3);
    expect(point.availablePctWithPending).toBe(75);
    expect(point.onLeavePending).toBe(1);
  });

  it("mixes an approved dip with an additional pending request on top of it", () => {
    // 4 headcount: 1 approved out (confirmed dip to 75%), plus 1 more pending
    // (would drop to 50% if that pending request also gets approved).
    const d = rangeDay({
      date: "2026-07-21",
      onLeave: 2,
      onLeaveApproved: 1,
      availableCount: 2,
      availablePct: 50,
      availableCountApproved: 3,
      availablePctApproved: 75,
    });

    const [point] = buildForecastPoints([d]);

    expect(point.availablePctApproved).toBe(75);
    expect(point.availablePctWithPending).toBe(50);
    expect(point.onLeaveApproved).toBe(1);
    expect(point.onLeavePending).toBe(1);
  });

  it("leaves non-working days (weekend/holiday) with a null % in both series", () => {
    const d = rangeDay({
      date: "2026-07-18", // a Saturday
      isWeekend: true,
      isWorkingDay: false,
      availablePct: null,
      availablePctApproved: null,
    });

    const [point] = buildForecastPoints([d]);

    expect(point.isWorkingDay).toBe(false);
    expect(point.availablePctApproved).toBeNull();
    expect(point.availablePctWithPending).toBeNull();
  });
});
