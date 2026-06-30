import { describe, it, expect } from "vitest";
import { workingDaysBetween } from "./working-days";

// PRD §5.5 AC1 — working days exclude weekends + configured holidays.
describe("workingDaysBetween", () => {
  it("excludes the weekend in a Mon–Sun range", () => {
    // 2026-07-06 (Mon) .. 2026-07-12 (Sun): 5 working days, 2 skipped.
    const r = workingDaysBetween("2026-07-06", "2026-07-12", false);
    expect(r.days).toBe(5);
    expect(r.skipped).toBe(2);
  });

  it("excludes a configured holiday (2026-07-17)", () => {
    // 2026-07-13 (Mon) .. 2026-07-17 (Fri): Fri is a holiday → 4 working days.
    const r = workingDaysBetween("2026-07-13", "2026-07-17", false);
    expect(r.days).toBe(4);
    expect(r.skipped).toBe(1);
  });

  it("counts a half-day as 0.5", () => {
    expect(workingDaysBetween("2026-07-06", "2026-07-06", true).days).toBe(0.5);
  });

  it("returns 0 for an inverted range", () => {
    expect(workingDaysBetween("2026-07-10", "2026-07-06", false).days).toBe(0);
  });
});
