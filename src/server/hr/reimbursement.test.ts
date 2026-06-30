import { describe, it, expect } from "vitest";
import {
  aggregateReimbursements,
  buildReimbursementCsv,
  type ReimbursementBatch,
} from "./reimbursement";

const row = (over: Partial<Parameters<typeof aggregateReimbursements>[0][number]> = {}) => ({
  claimId: "c1",
  userId: "u1",
  name: "Asha Rao",
  email: "asha@x.com",
  department: "Eng",
  category: "Sports",
  amountPaise: 100_00,
  expenseDate: "2026-05-01",
  status: "approved" as const,
  ...over,
});

describe("aggregateReimbursements", () => {
  it("folds claims into one entry per employee, summing integer paise", () => {
    const out = aggregateReimbursements([
      row({ claimId: "c1", amountPaise: 100_00, expenseDate: "2026-05-02" }),
      row({ claimId: "c2", amountPaise: 250_00, expenseDate: "2026-04-10", status: "auto_approved" }),
      row({ claimId: "c3", userId: "u2", name: "Bob Iyer", email: "bob@x.com", amountPaise: 500_00 }),
    ]);

    expect(out).toHaveLength(2);
    const asha = out.find((e) => e.userId === "u1")!;
    expect(asha.claimCount).toBe(2);
    expect(asha.totalPaise).toBe(350_00); // exact paise, no float drift
    expect(asha.claimIds.sort()).toEqual(["c1", "c2"]);
    // lines sorted by expense date
    expect(asha.lines.map((l) => l.claimId)).toEqual(["c2", "c1"]);
  });

  it("sorts employees by name", () => {
    const out = aggregateReimbursements([
      row({ userId: "u2", name: "Zoe", email: "z@x.com" }),
      row({ userId: "u1", name: "Anil", email: "a@x.com" }),
    ]);
    expect(out.map((e) => e.name)).toEqual(["Anil", "Zoe"]);
  });

  it("returns no employees for no rows", () => {
    expect(aggregateReimbursements([])).toEqual([]);
  });
});

describe("buildReimbursementCsv", () => {
  const batch: ReimbursementBatch = {
    fy: "2026-27",
    generatedAt: "2026-06-30T00:00:00.000Z",
    employees: aggregateReimbursements([
      row({ claimId: "c1", name: "Asha Rao", amountPaise: 350_00 }),
      row({ claimId: "c2", userId: "u2", name: "Bob, Jr", email: "bob@x.com", department: null, amountPaise: 500_00 }),
    ]),
    totalPaise: 850_00,
    totalClaims: 2,
  };

  it("emits a header, one row per employee, and a totals row", () => {
    const csv = buildReimbursementCsv(batch);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Employee,Email,Department,Claims,Total (INR),Total (paise),FY");
    expect(lines).toHaveLength(4); // header + 2 employees + total
    expect(lines[3]).toBe('TOTAL,,,2,850.00,85000,2026-27');
  });

  it("renders rupees with two decimals and the exact paise audit value", () => {
    const csv = buildReimbursementCsv(batch);
    expect(csv).toContain("Asha Rao,asha@x.com,Eng,1,350.00,35000,2026-27");
  });

  it("quotes fields containing a comma per RFC 4180", () => {
    const csv = buildReimbursementCsv(batch);
    expect(csv).toContain('"Bob, Jr"');
  });
});
