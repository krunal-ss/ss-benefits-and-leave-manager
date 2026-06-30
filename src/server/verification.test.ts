import { describe, it, expect } from "vitest";
import { fyBounds, runRuleChecks, type ClaimVerificationInput } from "./verification";

const base: ClaimVerificationInput = {
  hasDocument: true,
  isDuplicate: false,
  claimedPaise: 600000, // ₹6,000
  extractedPaise: 600000,
  expenseDate: "2026-06-20",
  referenceDate: "2026-06-29", // current FY 2026-27
  availablePaise: 900000,
  vendor: "Cult.fit",
  ocrConfidence: 0.96,
};

describe("fyBounds (1 Apr – 31 Mar)", () => {
  it("maps June 2026 to FY 2026-27", () => {
    expect(fyBounds("2026-06-20")).toEqual({ start: "2026-04-01", end: "2027-03-31", label: "2026-27" });
  });
  it("maps Feb 2026 to FY 2025-26", () => {
    expect(fyBounds("2026-02-10").label).toBe("2025-26");
  });
});

describe("runRuleChecks", () => {
  it("passes a clean claim (eligible for auto-approve)", () => {
    expect(runRuleChecks(base).passed).toBe(true);
  });

  it("fails + flags an amount mismatch", () => {
    const r = runRuleChecks({ ...base, extractedPaise: 550000 });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.label === "Amount matches receipt")?.ok).toBe(false);
  });

  it("fails when over balance (PRD AC1)", () => {
    expect(runRuleChecks({ ...base, claimedPaise: 1600000 }).passed).toBe(false);
  });

  it("fails on a duplicate (PRD AC2)", () => {
    expect(runRuleChecks({ ...base, isDuplicate: true }).passed).toBe(false);
  });

  it("fails when the date is outside the current FY", () => {
    expect(runRuleChecks({ ...base, expenseDate: "2027-05-01" }).passed).toBe(false);
  });

  it("fails on low OCR confidence", () => {
    expect(runRuleChecks({ ...base, ocrConfidence: 0.5 }).passed).toBe(false);
  });
});
