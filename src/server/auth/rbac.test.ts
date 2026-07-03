import { describe, it, expect } from "vitest";
import { assertCan, assertOwnership, can, ForbiddenError } from "./rbac";

// PRD §7 — roles × permissions matrix.
describe("rbac capabilities", () => {
  it("only HR Head approves expenses", () => {
    expect(can.approveExpense("hr_head")).toBe(true);
    expect(can.approveExpense("team_lead")).toBe(false);
    expect(can.approveExpense("employee")).toBe(false);
  });

  it("L1 is Team Lead, L2 is Project Manager", () => {
    expect(can.approveLeaveL1("team_lead")).toBe(true);
    expect(can.approveLeaveL1("project_manager")).toBe(false);
    expect(can.approveLeaveL2("project_manager")).toBe(true);
  });

  it("assertCan throws for a disallowed role", () => {
    expect(() => assertCan("employee", "approveExpense")).toThrow(ForbiddenError);
    expect(() => assertCan("hr_head", "approveExpense")).not.toThrow();
  });

  // KAN-80: availability CSV export — anyone who can see a capacity view
  // (Team Lead/Project Manager's own heatmap, or HR Head/Admin's heatmap +
  // department overview), never an employee.
  it("exportAvailability allows every approver/HR/admin role, never an employee", () => {
    expect(can.exportAvailability("team_lead")).toBe(true);
    expect(can.exportAvailability("project_manager")).toBe(true);
    expect(can.exportAvailability("hr_head")).toBe(true);
    expect(can.exportAvailability("admin")).toBe(true);
    expect(can.exportAvailability("employee")).toBe(false);
  });
});

describe("rbac ownership", () => {
  it("lets a user act on their own resource", () => {
    expect(() => assertOwnership({ role: "employee", actorId: "u1", resourceOwnerId: "u1" })).not.toThrow();
  });

  it("blocks acting on someone else's resource without privilege", () => {
    expect(() => assertOwnership({ role: "employee", actorId: "u1", resourceOwnerId: "u2" })).toThrow(ForbiddenError);
  });

  it("lets HR act on others' resources", () => {
    expect(() => assertOwnership({ role: "hr_head", actorId: "hr", resourceOwnerId: "u2" })).not.toThrow();
  });
});
