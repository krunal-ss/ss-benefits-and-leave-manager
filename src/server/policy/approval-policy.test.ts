import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROVAL_POLICY,
  decideRouting,
  isValidEmail,
  normaliseCcEmails,
  requiresSecondLevel,
  type ApprovalPolicy,
} from "./approval-policy";

const policy = (overrides: Partial<ApprovalPolicy> = {}): ApprovalPolicy => ({
  ...DEFAULT_APPROVAL_POLICY,
  ...overrides,
});

describe("decideRouting", () => {
  it("routes sequentially by default (TL then PM)", () => {
    const d = decideRouting({ kind: "leave", deductsBalance: true, workingDays: 2, policy: policy() });
    expect(d).toEqual({ outcome: "sequential", status: "pending_l1", currentLevel: 1 });
  });

  it("routes in parallel when configured", () => {
    const d = decideRouting({ kind: "wfh", deductsBalance: false, workingDays: 5, policy: policy({ routingMode: "parallel" }) });
    expect(d.outcome).toBe("parallel");
    expect(d).toMatchObject({ status: "pending_l1", currentLevel: 1 });
  });

  it("auto-approves short WFH within the threshold", () => {
    const d = decideRouting({
      kind: "wfh",
      deductsBalance: false,
      workingDays: 1,
      policy: policy({ wfhAutoApproveMaxDays: 2 }),
    });
    expect(d.outcome).toBe("auto_approved");
  });

  it("auto-approves WFH exactly at the threshold (inclusive)", () => {
    const d = decideRouting({ kind: "wfh", deductsBalance: false, workingDays: 2, policy: policy({ wfhAutoApproveMaxDays: 2 }) });
    expect(d.outcome).toBe("auto_approved");
  });

  it("routes WFH above the threshold to approvers", () => {
    const d = decideRouting({ kind: "wfh", deductsBalance: false, workingDays: 3, policy: policy({ wfhAutoApproveMaxDays: 2 }) });
    expect(d.outcome).toBe("sequential");
  });

  it("never auto-approves when the threshold is 0 (disabled)", () => {
    const d = decideRouting({ kind: "wfh", deductsBalance: false, workingDays: 1, policy: policy({ wfhAutoApproveMaxDays: 0 }) });
    expect(d.outcome).toBe("sequential");
  });

  it("NEVER auto-approves balance-deducting leave, even within the threshold (hard rule)", () => {
    const d = decideRouting({
      kind: "leave",
      deductsBalance: true,
      workingDays: 1,
      policy: policy({ wfhAutoApproveMaxDays: 5 }),
    });
    expect(d.outcome).not.toBe("auto_approved");
    expect(d.outcome).toBe("sequential");
  });

  it("does not auto-approve a zero/invalid-day request", () => {
    const d = decideRouting({ kind: "wfh", deductsBalance: false, workingDays: 0, policy: policy({ wfhAutoApproveMaxDays: 2 }) });
    expect(d.outcome).toBe("sequential");
  });
});

describe("requiresSecondLevel", () => {
  it("requires L2 in sequential mode", () => {
    expect(requiresSecondLevel(policy({ routingMode: "sequential" }))).toBe(true);
  });
  it("does not require L2 in parallel mode", () => {
    expect(requiresSecondLevel(policy({ routingMode: "parallel" }))).toBe(false);
  });
});

describe("normaliseCcEmails", () => {
  it("trims, lowercases, drops blanks and dedupes", () => {
    expect(normaliseCcEmails([" HR@x.com ", "hr@x.com", "", "  ", "team@x.com"])).toEqual([
      "hr@x.com",
      "team@x.com",
    ]);
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible address and rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
