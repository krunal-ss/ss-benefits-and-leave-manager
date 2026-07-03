import { describe, it, expect } from "vitest";
import { buildAvailabilityCsv } from "./availability-csv";
import type { RangeDayAvailability } from "./availability";

// Minimal RangeDayAvailability factory — mirrors the one in capacity-forecast.test.ts.
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

describe("buildAvailabilityCsv", () => {
  it("has a header row with the minimum required columns", () => {
    const csv = buildAvailabilityCsv([]);
    expect(csv.split("\r\n")[0]).toBe("Date,Headcount,On Leave,WFH,Available,Available %");
  });

  it("emits one data row per supplied day, in order", () => {
    const days = [rangeDay({ date: "2026-07-06" }), rangeDay({ date: "2026-07-07" })];
    const rows = buildAvailabilityCsv(days).split("\r\n");
    expect(rows).toHaveLength(3); // header + 2 days
    expect(rows[1].startsWith("2026-07-06,")).toBe(true);
    expect(rows[2].startsWith("2026-07-07,")).toBe(true);
  });

  it("renders headcount, on-leave, WFH, and available counts for a normal working day", () => {
    const day = rangeDay({
      date: "2026-07-06",
      headcount: 4,
      onLeave: 1,
      onWfh: 2,
      availableCount: 3,
      availablePct: 75,
    });
    const [, row] = buildAvailabilityCsv([day]).split("\r\n");
    expect(row).toBe("2026-07-06,4,1,2,3,75");
  });

  it("renders a fractional (half-day) on-leave/available count with one decimal", () => {
    const day = rangeDay({ date: "2026-07-06", headcount: 4, onLeave: 0.5, availableCount: 3.5, availablePct: 88 });
    const [, row] = buildAvailabilityCsv([day]).split("\r\n");
    expect(row).toBe("2026-07-06,4,0.5,0,3.5,88");
  });

  it("leaves Available % blank on a non-working day (weekend/holiday) instead of printing null", () => {
    const day = rangeDay({ date: "2026-07-04", isWeekend: true, isWorkingDay: false, availablePct: null });
    const [, row] = buildAvailabilityCsv([day]).split("\r\n");
    expect(row).toBe("2026-07-04,4,0,0,4,");
  });
});
