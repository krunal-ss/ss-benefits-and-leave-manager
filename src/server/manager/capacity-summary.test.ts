import { describe, it, expect } from "vitest";
import { getCapacitySummary } from "./capacity-summary";
import type { AvailabilityDay, AvailabilityWeek } from "./availability";

// Minimal AvailabilityDay factory — only the fields getCapacitySummary reads
// need to vary per test; the rest are filled with sane in-month-workday
// defaults so each test only overrides what it's exercising.
function day(overrides: Partial<AvailabilityDay> & Pick<AvailabilityDay, "date">): AvailabilityDay {
  return {
    day: Number(overrides.date.slice(-2)),
    inMonth: true,
    isWeekend: false,
    isHoliday: false,
    holidayName: "",
    isToday: false,
    headcount: 4,
    onLeave: 0,
    onWfh: 0,
    availableCount: 4,
    availablePct: 100,
    ...overrides,
  };
}

function weeksOf(days: AvailabilityDay[]): AvailabilityWeek[] {
  return [{ days }];
}

describe("getCapacitySummary", () => {
  it("weights a half-day leave as 50% unavailable on a normal working day", () => {
    // 4 headcount, one report on a half-day leave -> 3.5 available -> 88% (matches availability.ts's own rounding).
    const d = day({
      date: "2026-07-06",
      onLeave: 0.5,
      availableCount: 3.5,
      availablePct: Math.round((3.5 / 4) * 100), // 88
    });
    const summary = getCapacitySummary(weeksOf([d]), "2026-07-06");

    expect(summary).not.toBeNull();
    expect(summary?.isWorkingDay).toBe(true);
    expect(summary?.onLeaveCount).toBe(0.5);
    expect(summary?.availablePct).toBe(88);
    expect(summary?.headcount).toBe(4);
  });

  it("counts WFH as available, not unavailable", () => {
    // 4 headcount, 2 WFH, 0 on leave -> WFH doesn't reduce availableCount/pct.
    const d = day({
      date: "2026-07-07",
      onWfh: 2,
      onLeave: 0,
      availableCount: 4,
      availablePct: 100,
    });
    const summary = getCapacitySummary(weeksOf([d]), "2026-07-07");

    expect(summary).not.toBeNull();
    expect(summary?.wfhCount).toBe(2);
    expect(summary?.onLeaveCount).toBe(0);
    expect(summary?.availablePct).toBe(100);
  });

  it("flags a weekend as non-working instead of returning a misleading %", () => {
    const d = day({
      date: "2026-07-04", // a Saturday
      isWeekend: true,
      availableCount: 4,
      availablePct: null, // availability.ts never computes a % for a non-working day
    });
    const summary = getCapacitySummary(weeksOf([d]), "2026-07-04");

    expect(summary).not.toBeNull();
    expect(summary?.isWorkingDay).toBe(false);
    expect(summary?.availablePct).toBeNull();
  });

  it("flags a holiday as non-working and carries the holiday name", () => {
    const d = day({
      date: "2026-07-17",
      isHoliday: true,
      holidayName: "Company Founding Day",
      availablePct: null,
    });
    const summary = getCapacitySummary(weeksOf([d]), "2026-07-17");

    expect(summary).not.toBeNull();
    expect(summary?.isWorkingDay).toBe(false);
    expect(summary?.holidayName).toBe("Company Founding Day");
    expect(summary?.availablePct).toBeNull();
  });

  it("returns null when the date isn't present in the supplied weeks", () => {
    const d = day({ date: "2026-07-06" });
    expect(getCapacitySummary(weeksOf([d]), "2026-08-01")).toBeNull();
  });
});
