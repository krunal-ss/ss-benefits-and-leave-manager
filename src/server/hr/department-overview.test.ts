// KAN-80: unit coverage for the new role/department filters on
// getDepartmentOverview. availability.ts's own day-level calc
// (getAvailabilityForRange) is already covered elsewhere (KAN-75/76/79
// suites) — stubbed here so this file only exercises department-overview.ts's
// own grouping/filtering logic, same isolation approach as
// capacity-forecast.write-snapshot.test.ts.
import { describe, it, expect, vi } from "vitest";
import type { User } from "@/db/schema";

vi.mock("server-only", () => ({}));

const allUsers = [
  { id: "u1", name: "Alice", role: "employee", department: "Engineering" },
  { id: "u2", name: "Bob", role: "team_lead", department: "Engineering" },
  { id: "u3", name: "Carol", role: "employee", department: "Sales" },
  { id: "u4", name: "Dave", role: "employee", department: null }, // -> "Unassigned"
];

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => Promise.resolve(allUsers) }),
  }),
}));

vi.mock("@/server/hr/staffing-thresholds", () => ({
  listThresholds: vi.fn().mockResolvedValue({ orgDefault: null, departmentOverrides: [] }),
}));

vi.mock("@/server/manager/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/manager/availability")>();
  return {
    ...actual,
    // Stub the shared day-level calc — its own numbers aren't what's under
    // test here, only which ids/how many members each department row got.
    getAvailabilityForRange: vi.fn().mockImplementation((ids: string[]) =>
      Promise.resolve([
        {
          date: "2026-07-06",
          isWeekend: false,
          isHoliday: false,
          holidayName: "",
          isWorkingDay: true,
          headcount: ids.length,
          onLeave: 0,
          onLeaveApproved: 0,
          onWfh: 0,
          availableCount: ids.length,
          availablePct: ids.length > 0 ? 100 : null,
          availableCountApproved: ids.length,
          availablePctApproved: ids.length > 0 ? 100 : null,
        },
      ]),
    ),
  };
});

const hrHead: User = {
  id: "hr-1",
  name: "HR Head",
  email: "hr@example.com",
  role: "hr_head",
  teamLeadId: null,
  projectManagerId: null,
  department: null,
  isCriticalRole: false,
  joinDate: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const employee: User = { ...hrHead, id: "e-1", role: "employee" };

describe("getDepartmentOverview filters (KAN-80)", () => {
  it("with no filters, groups every user by department including 'Unassigned'", async () => {
    const { getDepartmentOverview } = await import("./department-overview");
    const overview = await getDepartmentOverview(hrHead, "2026-07-06");
    expect(overview.rows.map((r) => r.department)).toEqual(["Engineering", "Sales", "Unassigned"]);
    expect(overview.rows.find((r) => r.department === "Engineering")!.headcount).toBe(2);
  });

  it("role filter narrows department membership before grouping", async () => {
    const { getDepartmentOverview } = await import("./department-overview");
    const overview = await getDepartmentOverview(hrHead, "2026-07-06", { role: "employee" });
    const eng = overview.rows.find((r) => r.department === "Engineering")!;
    // Bob (team_lead) is excluded — only Alice (employee) counts.
    expect(eng.headcount).toBe(1);
    expect(eng.managers).toEqual([]); // the only manager (Bob) was filtered out
  });

  it("department filter narrows the result to a single department's row", async () => {
    const { getDepartmentOverview } = await import("./department-overview");
    const overview = await getDepartmentOverview(hrHead, "2026-07-06", { department: "Sales" });
    expect(overview.rows.map((r) => r.department)).toEqual(["Sales"]);
    expect(overview.rows[0].headcount).toBe(1);
  });

  it("role + department filters compose", async () => {
    const { getDepartmentOverview } = await import("./department-overview");
    const overview = await getDepartmentOverview(hrHead, "2026-07-06", { role: "team_lead", department: "Engineering" });
    expect(overview.rows).toHaveLength(1);
    expect(overview.rows[0].headcount).toBe(1); // just Bob
  });

  it("throws for a non-HR/Admin role, never leaking into a manager's own scoped view", async () => {
    const { getDepartmentOverview } = await import("./department-overview");
    await expect(getDepartmentOverview(employee)).rejects.toThrow();
  });
});

describe("resolveDepartmentMemberIds (KAN-80)", () => {
  it("resolves a department's member ids, optionally narrowed by role", async () => {
    const { resolveDepartmentMemberIds } = await import("./department-overview");
    expect(await resolveDepartmentMemberIds("Engineering")).toEqual(["u1", "u2"]);
    expect(await resolveDepartmentMemberIds("Engineering", "employee")).toEqual(["u1"]);
    expect(await resolveDepartmentMemberIds("Unassigned")).toEqual(["u4"]);
  });
});
