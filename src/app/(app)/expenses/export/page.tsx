import { requireAccess } from "@/server/auth/current-user";
import { getReimbursementBatch } from "@/server/hr/reimbursement";
import { ReimbursementClient } from "./reimbursement-client";

export const metadata = { title: "Reimbursement export · SmartSense" };

export default async function ReimbursementExportPage() {
  await requireAccess("/expenses/export");
  const batch = await getReimbursementBatch();

  // Serialize only what the client needs (per-employee totals as paise + counts).
  const rows = batch.employees.map((e) => ({
    userId: e.userId,
    name: e.name,
    email: e.email,
    department: e.department,
    claimCount: e.claimCount,
    totalPaise: e.totalPaise,
  }));

  return (
    <ReimbursementClient
      fy={batch.fy}
      rows={rows}
      totalPaise={batch.totalPaise}
      totalClaims={batch.totalClaims}
    />
  );
}
