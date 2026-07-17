// Identity, role labels, navigation, and module-access policy. Roles come from
// the authenticated user's DB row (reporting lines are DATA, never hard-coded).
// This module is isomorphic (imported by both Server Components and the client
// sidebar), so it must stay free of server-only imports.

import type { AppRole } from "@/server/auth/rbac";

const ALL_ROLES: AppRole[] = ["employee", "team_lead", "project_manager", "hr_head", "admin"];

/**
 * Roles a user may self-select at signup. Privileged roles (hr_head, admin) are
 * intentionally excluded and assigned manually — keeping them out here is also
 * the security boundary: resolveSignupRole() rejects anything not in this set.
 */
export const SIGNUP_ROLES: AppRole[] = ["employee", "team_lead", "project_manager"];

/**
 * Resolve a self-selected signup role (e.g. from client-editable user_metadata)
 * to a trusted AppRole. Anything outside SIGNUP_ROLES — including hr_head/admin
 * or garbage — falls back to "employee", so metadata can never self-escalate.
 */
export function resolveSignupRole(requested: string | null | undefined): AppRole {
  return (SIGNUP_ROLES as string[]).includes(requested ?? "")
    ? (requested as AppRole)
    : "employee";
}

/** Human-readable label for a role (shown at the bottom of the sidebar). */
export const ROLE_LABEL: Record<AppRole, string> = {
  employee: "Employee",
  team_lead: "Team Lead",
  project_manager: "Project Manager",
  hr_head: "HR Head",
  admin: "Admin",
};

// Which roles may access each app module (matched by route prefix). This is the
// single source of truth for both nav visibility AND server-side enforcement.
const MODULE_ACCESS: { prefix: string; roles: AppRole[] }[] = [
  { prefix: "/dashboard", roles: ALL_ROLES },
  { prefix: "/submit", roles: ALL_ROLES },
  { prefix: "/leave", roles: ALL_ROLES },
  // --- KAN-223 (self-service profile) — personal, all roles ---
  { prefix: "/profile", roles: ALL_ROLES },
  { prefix: "/approvals", roles: ["team_lead", "project_manager"] },
  { prefix: "/calendar", roles: ["team_lead", "project_manager", "hr_head", "admin"] },
  // --- KAN-75 (team availability heatmap) START ---
  { prefix: "/availability", roles: ["team_lead", "project_manager", "hr_head", "admin"] },
  // --- KAN-75 END ---
  { prefix: "/expenses", roles: ["hr_head", "admin"] },
  { prefix: "/reports", roles: ["hr_head", "admin"] }, // KAN-44: HR reporting dashboard
  // --- KAN-45 (reimbursement export) START ---
  // The /expenses prefix above already grants this sub-route; listed explicitly for clarity.
  { prefix: "/expenses/export", roles: ["hr_head", "admin"] },
  // --- KAN-45 END ---
  // --- KAN-49 (admin console) START ---
  { prefix: "/admin", roles: ["hr_head", "admin"] },
  // --- KAN-49 END ---
  // --- KAN-46 (approval policy switch + notification CC) START ---
  { prefix: "/settings/approvals", roles: ["hr_head", "admin"] },
  // --- KAN-46 END ---
  // --- KAN-74 (staffing threshold configuration) START ---
  { prefix: "/settings/staffing-thresholds", roles: ["hr_head", "admin"] },
  // --- KAN-74 END ---
  // --- KAN-78 (HR department-wide availability overview) START ---
  { prefix: "/departments", roles: ["hr_head", "admin"] },
  // --- KAN-78 END ---
  // --- KAN-148 (benefit reminder settings) START ---
  { prefix: "/reminders", roles: ["hr_head", "admin"] },
  // --- KAN-148 END ---
  // --- KAN-168 (notification preferences) START ---
  // Personal settings screen — every role may configure their own, unlike the
  // HR/Admin-only settings/* screens above. Listed explicitly for clarity
  // even though canAccessPath already defaults an unlisted prefix to "everyone".
  { prefix: "/settings/notifications", roles: ALL_ROLES },
  // --- KAN-168 END ---
  // --- KAN-185/186/187 (Quick Search, Recent Activities, Leave Policy Viewer) START ---
  { prefix: "/search", roles: ALL_ROLES },
  { prefix: "/activity", roles: ALL_ROLES },
  { prefix: "/leave-policy", roles: ALL_ROLES },
  { prefix: "/settings/leave-policy", roles: ["hr_head", "admin"] },
  // --- KAN-185/186/187 END ---
];

/** May `role` access `path`? Unknown paths (e.g. "/") are allowed. */
export function canAccessPath(role: AppRole, path: string): boolean {
  const match = MODULE_ACCESS.find((m) => path === m.prefix || path.startsWith(`${m.prefix}/`));
  return match ? match.roles.includes(role) : true;
}

/** The route a role lands on after login / when blocked from a forbidden module. */
export function homeRouteFor(role: AppRole): string {
  if (role === "team_lead" || role === "project_manager") return "/approvals";
  if (role === "hr_head" || role === "admin") return "/expenses";
  return "/dashboard";
}

// Sidebar navigation, grouped into sections. A section/item is shown only when
// the viewer's role can access it (see canAccessPath). `key` maps to an icon in
// the sidebar so this module stays icon/JSX-free.
export type NavItem = { href: string; label: string; key: string };
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "My workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", key: "dashboard" },
      { href: "/submit", label: "Submit expense", key: "submit" },
      { href: "/leave", label: "Apply leave / WFH", key: "leave" },
      // --- KAN-168 (notification preferences) START ---
      { href: "/settings/notifications", label: "Notification preferences", key: "settings-notifications" },
      // --- KAN-168 END ---
      // --- KAN-186 (Recent Activities Widget) START ---
      { href: "/activity", label: "Recent activity", key: "activity" },
      // --- KAN-186 END ---
      // --- KAN-187 (Leave Policy Viewer) START ---
      { href: "/leave-policy", label: "Leave policies", key: "leave-policy" },
      // --- KAN-187 END ---
      // --- KAN-223 (Profile Completion Tracker) START ---
      { href: "/profile", label: "My profile", key: "profile" },
      // --- KAN-223 END ---
    ],
  },
  {
    label: "Manager",
    items: [
      { href: "/approvals", label: "Approvals", key: "approvals" },
      { href: "/calendar", label: "Team calendar", key: "calendar" },
      // --- KAN-75 (team availability heatmap) START ---
      { href: "/availability", label: "Availability heatmap", key: "availability" },
      // --- KAN-75 END ---
    ],
  },
  {
    label: "HR Head",
    items: [
      { href: "/expenses", label: "Expense queue", key: "expenses" },
      // --- KAN-148 (benefit reminder settings) START ---
      { href: "/reminders", label: "Benefit reminders", key: "reminders" },
      // --- KAN-148 END ---
      { href: "/expenses/history", label: "Decided claims", key: "expenses-history" },
      { href: "/reports", label: "Reports", key: "reports" }, // KAN-44: HR reporting dashboard
      // --- KAN-78 (HR department-wide availability overview) START ---
      { href: "/departments", label: "Departments", key: "departments" },
      // --- KAN-78 END ---
      // --- KAN-45 (reimbursement export) START ---
      { href: "/expenses/export", label: "Reimbursement export", key: "expenses-export" },
      // --- KAN-45 END ---
      { href: "/calendar", label: "Org calendar", key: "calendar-hr" },
      // --- KAN-75 (team availability heatmap) START ---
      { href: "/availability", label: "Team availability", key: "availability-hr" },
      // --- KAN-75 END ---
      // --- KAN-46 (approval policy switch + notification CC) START ---
      { href: "/settings/approvals", label: "Approval policy", key: "settings-approvals" },
      // --- KAN-46 END ---
      // --- KAN-74 (staffing threshold configuration) START ---
      { href: "/settings/staffing-thresholds", label: "Staffing thresholds", key: "settings-staffing-thresholds" },
      // --- KAN-74 END ---
      // --- KAN-187 (leave policy content + PDF) START ---
      { href: "/settings/leave-policy", label: "Leave policy content", key: "settings-leave-policy" },
      // --- KAN-187 END ---
    ],
  },
  // --- KAN-49 (admin console) START ---
  {
    label: "Administration",
    items: [{ href: "/admin", label: "Admin console", key: "admin" }],
  },
  // --- KAN-49 END ---
];
