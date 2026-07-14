import "server-only";
// KAN-155: overdue-approval escalation emails — Approval SLA Timer epic (KAN-147).
// Mirrors capacity-alert.ts's per-item dedup pattern: each of these two
// functions handles ONE already-confirmed-overdue row (the job in
// ./overdue-escalation-job.ts does the SLA-breach detection and calls these
// per row via Promise.allSettled), checks emailLog for an existing row with
// the exact same subject+template before sending, and always writes an
// emailLog row (sent/failed) — that row IS the traceability, no separate audit
// log (same reasoning as capacity-alert.ts; this never touches a balance).
//
// Escalation target mirrors the existing informational-only UI copy so this
// cron finally makes real what approval-card.tsx / expenses-client.tsx already
// tell the approver: an overdue L1 leave request escalates to the Project
// Manager (L2); an overdue L2 request skip-levels to HR Head; an overdue
// expense (already at the only level, HR Head) re-notifies HR Head.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, users } from "@/db/schema";
import { sendEmail } from "@/server/email";

export const OVERDUE_ESCALATION_TEMPLATE = "overdue_escalation";

export type OverdueLeaveRow = {
  id: string;
  createdAt: Date;
  status: "pending_l1" | "pending_l2";
  applicantName: string;
  teamLeadEmail: string | null;
  projectManagerEmail: string | null;
};

export type OverdueExpenseRow = {
  id: string;
  createdAt: Date;
  applicantName: string;
};

function shortRef(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

async function alreadyEscalated(subject: string): Promise<boolean> {
  const db = getDb();
  const [existing] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.subject, subject), eq(emailLog.template, OVERDUE_ESCALATION_TEMPLATE)))
    .limit(1);
  return !!existing;
}

async function sendEscalation(to: string[], cc: string[] | undefined, subject: string, html: string): Promise<void> {
  const db = getDb();
  const toAddress = to.join(", ");
  try {
    await sendEmail({ to, cc, subject, html });
    await db.insert(emailLog).values({ toAddress, subject, template: OVERDUE_ESCALATION_TEMPLATE, status: "sent" });
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress, subject, template: OVERDUE_ESCALATION_TEMPLATE, status: "failed" })
      .catch(() => {});
  }
}

/**
 * Escalates one already-overdue leave/WFH request. No-op (no email, no
 * emailLog row) when: an escalation for this exact request+date was already
 * logged, or there's nobody configured to escalate to (no PM on the request /
 * no HR Head user at all).
 */
export async function notifyOverdueLeaveRequest(row: OverdueLeaveRow, now: Date = new Date()): Promise<void> {
  const ref = shortRef("LR", row.id);
  const date = now.toISOString().slice(0, 10);
  const subject = `Overdue approval escalation: ${ref} on ${date}`;
  if (await alreadyEscalated(subject)) return;

  let to: string[];
  let cc: string[] | undefined;
  let escalateLabel: string;
  if (row.status === "pending_l1") {
    if (!row.projectManagerEmail) return; // nobody to escalate to
    to = [row.projectManagerEmail];
    cc = row.teamLeadEmail ? [row.teamLeadEmail] : undefined;
    escalateLabel = "Project Manager (L2)";
  } else {
    const db = getDb();
    const hrHeads = await db.select({ email: users.email }).from(users).where(eq(users.role, "hr_head"));
    to = hrHeads.map((u) => u.email);
    if (to.length === 0) return; // no HR Head configured to notify
    cc = row.projectManagerEmail ? [row.projectManagerEmail] : undefined;
    escalateLabel = "HR Head (skip-level)";
  }

  const html = `<p>Leave/WFH request <strong>${ref}</strong> for ${row.applicantName}, submitted on ${row.createdAt.toISOString().slice(0, 10)}, has breached its approval SLA and is auto-escalated to <strong>${escalateLabel}</strong>.</p>`;
  await sendEscalation(to, cc, subject, html);
}

/**
 * Escalates one already-overdue expense claim (`pending_hr`, so HR Head is
 * already the only level — this re-notifies HR Head that it's now overdue).
 */
export async function notifyOverdueExpenseClaim(row: OverdueExpenseRow, now: Date = new Date()): Promise<void> {
  const ref = shortRef("BC", row.id);
  const date = now.toISOString().slice(0, 10);
  const subject = `Overdue approval escalation: ${ref} on ${date}`;
  if (await alreadyEscalated(subject)) return;

  const db = getDb();
  const hrHeads = await db.select({ email: users.email }).from(users).where(eq(users.role, "hr_head"));
  const to = hrHeads.map((u) => u.email);
  if (to.length === 0) return; // no HR Head configured to notify

  const html = `<p>Expense claim <strong>${ref}</strong> for ${row.applicantName}, submitted on ${row.createdAt.toISOString().slice(0, 10)}, has breached its review SLA and needs HR Head attention.</p>`;
  await sendEscalation(to, undefined, subject, html);
}
