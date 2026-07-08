// KAN-147 — pure SLA math. Fixed `now` passed explicitly so every assertion
// is deterministic (no reliance on the real clock/timers).
import { describe, it, expect } from "vitest";
import { computeSla, summarizeSla, EXPENSE_SLA_HOURS, LEAVE_SLA_HOURS } from "./sla";

const NOW = new Date("2026-07-07T12:00:00.000Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3600_000);
}

describe("computeSla", () => {
  it("is 'ok' well within the SLA window", () => {
    const sla = computeSla(hoursAgo(2), LEAVE_SLA_HOURS, NOW); // 22h left of 24h
    expect(sla.state).toBe("ok");
    expect(sla.label).toBe("22h 00m 00s left");
    expect(sla.remainingMs).toBe(22 * 3600_000);
    expect(sla.pct).toBe(Math.round((2 / 24) * 100));
  });

  it("is 'ok' at the very start of the window (just created)", () => {
    const sla = computeSla(NOW, EXPENSE_SLA_HOURS, NOW);
    expect(sla.state).toBe("ok");
    expect(sla.label).toBe("48h 00m 00s left");
    expect(sla.pct).toBe(0);
  });

  it("boundary: exactly 1 hour remaining is 'soon' (<=1h)", () => {
    const sla = computeSla(hoursAgo(23), LEAVE_SLA_HOURS, NOW); // exactly 1h left of 24h
    expect(sla.state).toBe("soon");
    expect(sla.label).toBe("1h 00m 00s left");
    expect(sla.remainingMs).toBe(3600_000);
  });

  it("boundary: 1 second over 1 hour remaining is still 'ok'", () => {
    const createdAt = new Date(NOW.getTime() - (LEAVE_SLA_HOURS * 3600_000 - 3601_000));
    const sla = computeSla(createdAt, LEAVE_SLA_HOURS, NOW);
    expect(sla.state).toBe("ok");
    expect(sla.remainingMs).toBe(3601_000);
  });

  it("is 'soon' well inside the last hour", () => {
    const createdAt = new Date(NOW.getTime() - (EXPENSE_SLA_HOURS * 3600_000 - 15 * 60_000)); // 15m left of 48h
    const sla = computeSla(createdAt, EXPENSE_SLA_HOURS, NOW);
    expect(sla.state).toBe("soon");
    expect(sla.label).toBe("0h 15m 00s left");
  });

  it("boundary: exactly at the target hours elapsed is 'overdue' (remainingMs === 0)", () => {
    const sla = computeSla(hoursAgo(LEAVE_SLA_HOURS), LEAVE_SLA_HOURS, NOW);
    expect(sla.state).toBe("overdue");
    expect(sla.label).toBe("Overdue by 0h 00m 00s");
    expect(sla.remainingMs).toBe(0);
    expect(sla.pct).toBe(100);
  });

  it("is 'overdue' past the target, with the correct overdue-by clock", () => {
    const sla = computeSla(hoursAgo(EXPENSE_SLA_HOURS + 3), EXPENSE_SLA_HOURS, NOW); // 3h past due
    expect(sla.state).toBe("overdue");
    expect(sla.label).toBe("Overdue by 3h 00m 00s");
    expect(sla.pct).toBe(100);
  });

  it("accepts an ISO string createdAt, same as a Date", () => {
    const iso = hoursAgo(2).toISOString();
    const sla = computeSla(iso, LEAVE_SLA_HOURS, NOW);
    expect(sla.state).toBe("ok");
    expect(sla.label).toBe("22h 00m 00s left");
  });
});

describe("summarizeSla", () => {
  it("buckets a mixed set of timestamps into ok/soon/over counts", () => {
    const createdAts = [
      hoursAgo(1), // 23h left -> ok
      hoursAgo(23), // 1h left -> soon
      hoursAgo(30), // overdue by 6h
      hoursAgo(0), // 24h left -> ok
    ];
    expect(summarizeSla(createdAts, LEAVE_SLA_HOURS, NOW)).toEqual({ ok: 2, soon: 1, over: 1 });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(summarizeSla([], EXPENSE_SLA_HOURS, NOW)).toEqual({ ok: 0, soon: 0, over: 0 });
  });
});
