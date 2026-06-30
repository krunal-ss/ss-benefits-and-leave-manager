import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/rbac";
import { buildReimbursementCsv, getReimbursementBatch } from "@/server/hr/reimbursement";
import { currentFy } from "@/lib/fy";

// KAN-45 — payout CSV download. Route handler (not a Server Action) so the browser
// gets a real file with download headers. HR Head-only, gated on the same
// runReimbursementExport capability as the page + the mark-reimbursed action.

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (!can.runReimbursementExport(me.role)) return new Response("Forbidden", { status: 403 });

  const requested = new URL(request.url).searchParams.get("fy");
  const fy = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : currentFy().label;

  const batch = await getReimbursementBatch(fy);
  const csv = buildReimbursementCsv(batch);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reimbursement-${fy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
