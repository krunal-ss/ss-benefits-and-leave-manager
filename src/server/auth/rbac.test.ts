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
