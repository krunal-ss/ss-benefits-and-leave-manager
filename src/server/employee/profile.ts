// KAN-223 — Profile Completion Tracker. The completion percentage is DERIVED
// from the user row (same "don't persist what's computed" convention as
// getWalletLedger/getRecentActivity) — never stored. MANDATORY_PROFILE_FIELDS is
// the single source of truth for what "complete" means; both the dashboard card
// and the self-service edit form derive their labels/highlights from it.
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

export type ProfileFieldKey = "name" | "phone" | "department" | "emergencyContact";

export type ProfileField = {
  key: ProfileFieldKey;
  label: string;
  filled: boolean;
};

export type ProfileCompletion = {
  percent: number;
  filledCount: number;
  totalCount: number;
  fields: ProfileField[];
  /** The subset of `fields` that are still empty (drives missing-field highlights). */
  missing: ProfileField[];
};

/**
 * The mandatory profile fields the tracker measures. Deliberately limited to
 * fields the employee can fill themselves — role, reporting lines and joinDate
 * are org-assigned (admin-managed via updateUserAction) and are NOT part of the
 * self-service completion set.
 */
export const MANDATORY_PROFILE_FIELDS: { key: ProfileFieldKey; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "phone", label: "Phone number" },
  { key: "department", label: "Department" },
  { key: "emergencyContact", label: "Emergency contact" },
];

type ProfileInput = Pick<User, ProfileFieldKey>;

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Pure, unit-testable completion calc over a user's profile fields. */
export function computeProfileCompletion(user: ProfileInput): ProfileCompletion {
  const fields: ProfileField[] = MANDATORY_PROFILE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    filled: isFilled(user[f.key]),
  }));
  const filledCount = fields.filter((f) => f.filled).length;
  const totalCount = fields.length;
  const percent = totalCount === 0 ? 100 : Math.round((filledCount / totalCount) * 100);
  return { percent, filledCount, totalCount, fields, missing: fields.filter((f) => !f.filled) };
}

/** Completion for a single employee — own data only (called with the caller's id). */
export async function getProfileCompletion(userId: string): Promise<ProfileCompletion> {
  const db = getDb();
  const [row] = await db
    .select({
      name: users.name,
      phone: users.phone,
      department: users.department,
      emergencyContact: users.emergencyContact,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return computeProfileCompletion(row ?? { name: "", phone: null, department: null, emergencyContact: null });
}
