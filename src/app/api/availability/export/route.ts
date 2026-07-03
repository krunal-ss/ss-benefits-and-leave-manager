import { NextResponse } from "next/server";
import { z } from "zod";
import { roleEnum } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/auth/rbac";
import { getAvailabilityForRange, resolveTeamScope } from "@/server/manager/availability";
import { buildAvailabilityCsv } from "@/server/manager/availability-csv";
import { resolveDepartmentMemberIds } from "@/server/hr/department-overview";

// KAN-80 — CSV export of the currently applied availability filters (BE
// sub-task). A POST (not GET) because the filter set is a body payload, not
// just query params — see src/app/(app)/expenses/export/download/route.ts
// for the sibling GET-download precedent this otherwise follows (Route
// Handler, not a Server Action, so the browser gets a real downloadable
// file).
//
// RBAC/ownership mirrors the interactive views exactly:
//  - "team" scope goes through resolveTeamScope — the same function the
//    heatmap uses, which ignores `teamId` entirely for a Team Lead/Project
//    Manager (always forced to their own reports) and only lets HR Head/Admin
//    choose an arbitrary team. A Team Lead/PM can never export another
//    manager's team by passing a different `teamId`.
//  - "department" scope requires the same `viewDepartmentOverview` capability
//    gate getDepartmentOverview enforces (HR Head/Admin only).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function daySpan(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

const exportRequestSchema = z
  .object({
    scope: z.enum(["team", "department"]),
    /** Honoured only for HR Head/Admin — resolveTeamScope ignores it for a Team Lead/Project Manager. */
    teamId: z.string().uuid().optional(),
    /** Required when scope is "department". */
    department: z.string().trim().min(1).optional(),
    role: z.enum(roleEnum.enumValues).optional(),
    leaveTypeId: z.string().uuid().optional(),
    fromDate: z.string().regex(ISO_DATE, "fromDate must be YYYY-MM-DD."),
    toDate: z.string().regex(ISO_DATE, "toDate must be YYYY-MM-DD."),
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate.",
    path: ["fromDate"],
  })
  .refine((v) => daySpan(v.fromDate, v.toDate) <= MAX_RANGE_DAYS, {
    message: `Date range too large (max ${MAX_RANGE_DAYS} days).`,
    path: ["toDate"],
  });

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can.exportAvailability(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  let reportIds: string[];
  let scopeLabel: string;
  if (input.scope === "department") {
    // HR/Admin only — never trust `department` from the body without this
    // check, otherwise a Team Lead/PM could export org-wide data.
    if (!can.viewDepartmentOverview(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!input.department) {
      return NextResponse.json({ error: 'department is required when scope is "department".' }, { status: 400 });
    }
    reportIds = await resolveDepartmentMemberIds(input.department, input.role);
    scopeLabel = input.department;
  } else {
    const scope = await resolveTeamScope(me, input.teamId, input.role);
    reportIds = scope.reportIds;
    scopeLabel = scope.teamName || scope.teamId || "team";
  }

  const days = await getAvailabilityForRange(reportIds, input.fromDate, input.toDate, input.leaveTypeId);
  const csv = buildAvailabilityCsv(days);
  const safeScope = scopeLabel.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "team";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="availability-${safeScope}-${input.fromDate}_${input.toDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
