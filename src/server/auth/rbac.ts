// Central RBAC. Every API/Server Action must check capability AND ownership
// before any DB call (employee sees only their own data; a TL only their reports).
// Pure functions so they're unit-testable and reusable everywhere.

import type { roleEnum } from "@/db/schema";

export type AppRole = (typeof roleEnum.enumValues)[number];

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const can = {
  submitExpense: (_role: AppRole) => true, // everyone submits their own
  approveExpense: (role: AppRole) => role === "hr_head",
  configurePolicy: (role: AppRole) => role === "hr_head" || role === "admin",
  applyLeave: (_role: AppRole) => true,
  approveLeaveL1: (role: AppRole) => role === "team_lead",
  approveLeaveL2: (role: AppRole) => role === "project_manager",
  runReimbursementExport: (role: AppRole) => role === "hr_head",
  // KAN-49: admin console. Policy config (benefit categories, leave types,
  // holidays) is HR-Head/Admin; changing users' roles + reporting lines is a
  // higher-trust action gated to Admin only.
  manageUsers: (role: AppRole) => role === "admin",
  // KAN-78: org-wide, cross-department availability overview — HR Head/Admin
  // only (never a manager's own scoped view; see src/server/hr/department-overview.ts).
  viewDepartmentOverview: (role: AppRole) => role === "hr_head" || role === "admin",
  // KAN-80: CSV export of a capacity view — any role that can already see one
  // of the underlying screens (the /availability heatmap for team_lead/
  // project_manager, or /availability + /departments for hr_head/admin — see
  // MODULE_ACCESS in src/server/users.ts). Never an employee.
  exportAvailability: (role: AppRole) =>
    role === "team_lead" || role === "project_manager" || role === "hr_head" || role === "admin",
} as const;

export type Capability = keyof typeof can;

/** Throw unless `role` has `capability`. */
export function assertCan(role: AppRole, capability: Capability): void {
  if (!can[capability](role)) {
    throw new ForbiddenError(`Role "${role}" cannot perform "${capability}".`);
  }
}

/**
 * Ownership / scope check. An employee may only act on their own resource;
 * privileged roles (their approvers / HR / admin) may act on others'.
 */
export function assertOwnership(params: {
  role: AppRole;
  actorId: string;
  resourceOwnerId: string;
  privilegedRoles?: AppRole[];
}): void {
  const { role, actorId, resourceOwnerId, privilegedRoles = ["hr_head", "admin"] } = params;
  if (actorId === resourceOwnerId) return;
  if (privilegedRoles.includes(role)) return;
  throw new ForbiddenError("You can only access your own data.");
}
