import "server-only";
// KAN-81: low-staffing email notifications — Story 4 of the Smart Team
// Availability & Capacity Planner epic (KAN-73). Hooks into the KAN-79 daily
// snapshot job (./capacity-snapshot-job.ts): immediately after each
// successful org/department-scope snapshot write, this compares that scope's
// capacityPercent against its KAN-74 threshold (department override wins,
// else the org default) and emails the relevant manager/HR Head on a breach.
//
// Team-scope snapshots are never checked here — KAN-74 thresholds only exist
// at org/department scope (src/server/hr/staffing-thresholds.ts), so there is
// nothing to compare a team snapshot against. The job only calls this for
// org/department scopes; this function also no-ops defensively if ever
// called with a team-scope snapshot.
//
// Dedup ("exactly one email per breach, no duplicate spam"): emailLog (the
// only notification-log table in this repo) is queried for an existing
// "low_staffing_alert" row with the exact same scope+date-encoded subject
// before sending — since the snapshot job runs once a day per scope, this
// makes the whole check idempotent even if the job were ever re-run for the
// same day. Per CLAUDE.md, this emailLog row (sent/failed) IS the
// traceability the story asks for — no separate audit log.
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, users } from "@/db/schema";
import { sendEmail } from "@/server/email";
import { isNotificationAllowed } from "@/server/notifications/preferences";
import { listThresholds } from "@/server/hr/staffing-thresholds";
import type { TeamCapacitySnapshotResult } from "./capacity-forecast";

const LOW_STAFFING_TEMPLATE = "low_staffing_alert";

/** KAN-168 — keep only the recipients who currently allow email (preference + quiet hours). */
async function filterAllowed<T extends { id: string }>(rows: T[]): Promise<T[]> {
  const flags = await Promise.all(rows.map((r) => isNotificationAllowed(r.id, { channel: "email" })));
  return rows.filter((_, i) => flags[i]);
}

function scopeLabel(snapshot: TeamCapacitySnapshotResult): string {
  return snapshot.scopeType === "org" ? "Organization" : (snapshot.scopeId ?? "Unknown department");
}

/**
 * Compares an org/department-scope capacity snapshot against its configured
 * KAN-74 threshold and emails the relevant manager/HR Head exactly once per
 * breach. No-op (no email, no emailLog row) when: the scope is healthy
 * (capacityPercent >= the threshold), no threshold is configured for the
 * scope, the scope is "team", or an alert for this exact scope+date was
 * already logged.
 */
export async function checkLowStaffingAndNotify(snapshot: TeamCapacitySnapshotResult): Promise<void> {
  if (snapshot.scopeType !== "org" && snapshot.scopeType !== "department") return;

  const { orgDefault, departmentOverrides } = await listThresholds();
  const applicable =
    snapshot.scopeType === "department"
      ? (departmentOverrides.find((t) => t.scopeValue === snapshot.scopeId) ?? orgDefault)
      : orgDefault;
  if (!applicable) return; // no threshold configured for this scope — no breach is possible
  if (snapshot.capacityPercent >= applicable.minAvailablePercent) return; // healthy

  const label = scopeLabel(snapshot);
  const subject = `Low staffing alert: ${label} on ${snapshot.date}`;

  const db = getDb();
  const [existing] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.subject, subject), eq(emailLog.template, LOW_STAFFING_TEMPLATE)))
    .limit(1);
  if (existing) return; // already alerted for this exact scope+date — no duplicate spam

  // KAN-168 — filter each recipient list down to those with email notifications
  // on right now (preference + quiet hours). A multi-recipient send like this
  // one can't gate at a single point the way a 1:1 notify() call does, so each
  // list is filtered independently before the send.
  const hrHeadRows = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "hr_head"));
  const allowedHrHeads = await filterAllowed(hrHeadRows);
  const to = allowedHrHeads.map((u) => u.email);
  if (to.length === 0) return; // no HR Head configured/opted-in to notify

  let cc: string[] | undefined;
  if (snapshot.scopeType === "department" && snapshot.scopeId) {
    const managerRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.department, snapshot.scopeId), inArray(users.role, ["team_lead", "project_manager"])));
    const allowedManagers = await filterAllowed(managerRows);
    cc = allowedManagers.length ? allowedManagers.map((u) => u.email) : undefined;
  }

  const html = `<p>Team capacity for <strong>${label}</strong> dropped to ${snapshot.capacityPercent}% on ${snapshot.date}, below the configured minimum of ${applicable.minAvailablePercent}%.</p>`;
  const toAddress = to.join(", ");

  try {
    await sendEmail({ to, cc, subject, html });
    await db.insert(emailLog).values({ toAddress, subject, template: LOW_STAFFING_TEMPLATE, status: "sent" });
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress, subject, template: LOW_STAFFING_TEMPLATE, status: "failed" })
      .catch(() => {});
  }
}
