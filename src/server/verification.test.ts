import { describe, it, expect } from "vitest";
import { buildFraudSignals, computeAiScore, fyBounds, runRuleChecks, type ClaimVerificationInput } from "./verification";

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

describe("computeAiScore (KAN-111)", () => {
  it("scores a clean claim high and recommends approve", () => {
    const { checks } = runRuleChecks(base);
    const result = computeAiScore(checks, { isDuplicate: false });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.verdict).toBe("approve");
    expect(result.factors).toHaveLength(checks.length);
    expect(result.factors.every((f) => f.positive)).toBe(true);
  });

  it("forces reject on a duplicate regardless of otherwise-clean checks", () => {
    const { checks } = runRuleChecks({ ...base, isDuplicate: true });
    const result = computeAiScore(checks, { isDuplicate: true });
    expect(result.verdict).toBe("reject");
  });

  it("penalizes an amount mismatch with a negative factor", () => {
    const { checks } = runRuleChecks({ ...base, extractedPaise: 550000 });
    const result = computeAiScore(checks, { isDuplicate: false });
    const factor = result.factors.find((f) => f.label.startsWith("Amount matches receipt"));
    expect(factor?.positive).toBe(false);
    expect(factor?.delta).toBeLessThan(0);
  });

  it("penalizes low OCR confidence and lowers the score below a clean claim", () => {
    const clean = computeAiScore(runRuleChecks(base).checks, { isDuplicate: false });
    const lowConf = computeAiScore(runRuleChecks({ ...base, ocrConfidence: 0.5 }).checks, { isDuplicate: false });
    expect(lowConf.score).toBeLessThan(clean.score);
  });

  it("clamps the score to [0, 100]", () => {
    const failingEverything = runRuleChecks({
      ...base,
      hasDocument: false,
      isDuplicate: true,
      extractedPaise: null,
      claimedPaise: 999999999,
      expenseDate: "1999-01-01",
      vendor: "",
      ocrConfidence: 0,
    });
    const result = computeAiScore(failingEverything.checks, { isDuplicate: true });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("buildFraudSignals (KAN-111)", () => {
  it("reports a clean 'no duplicate' signal and all-ok signals for a clean claim", () => {
    const { checks } = runRuleChecks(base);
    const signals = buildFraudSignals(checks, { isDuplicate: false });
    expect(signals.find((s) => s.label === "Duplicate check")?.severity).toBe("ok");
    expect(signals.every((s) => s.severity === "ok")).toBe(true);
  });

  it("flags a duplicate as high severity with a note", () => {
    const { checks } = runRuleChecks({ ...base, isDuplicate: true });
    const signals = buildFraudSignals(checks, { isDuplicate: true, duplicateNote: "Matches claim ABC123." });
    const dup = signals.find((s) => s.label === "Duplicate suspected");
    expect(dup?.severity).toBe("high");
    expect(dup?.detail).toBe("Matches claim ABC123.");
  });

  it("flags amount mismatch and over-balance without fabricating unrelated signals", () => {
    const { checks } = runRuleChecks({ ...base, extractedPaise: 550000, claimedPaise: 1600000 });
    const signals = buildFraudSignals(checks, { isDuplicate: false });
    expect(signals.find((s) => s.label === "Amount mismatch")?.severity).toBe("high");
    expect(signals.find((s) => s.label === "Over balance")?.severity).toBe("warn");
  });
});
