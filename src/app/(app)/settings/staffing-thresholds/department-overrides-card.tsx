"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { StaffingThresholdRow } from "@/server/hr/staffing-thresholds";
import { DepartmentThresholdDrawer } from "@/app/(app)/settings/staffing-thresholds/department-threshold-drawer";

export function DepartmentOverridesCard({ overrides }: { overrides: StaffingThresholdRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffingThresholdRow | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <div className="text-[15px] font-semibold">Department overrides</div>
          <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
            {overrides.length}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" strokeWidth={2.2} /> New override
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <th className="border-b px-3 py-[11px] pl-5 text-left font-medium">Department</th>
                <th className="border-b px-3 py-[11px] text-right font-medium">Min available %</th>
                <th className="border-b px-3 py-[11px] pr-5 text-right font-medium">Edit</th>
              </tr>
            </thead>
            <tbody>
              {overrides.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                    No department overrides — every department follows the org-wide default.
                  </td>
                </tr>
              ) : (
                overrides.map((t) => (
                  <tr key={t.id} className="border-b transition-colors hover:bg-muted/55">
                    <td className="px-3 py-3 pl-5 font-medium">{t.scopeValue}</td>
                    <td className="px-3 py-3 text-right tabular">{t.minAvailablePercent}%</td>
                    <td className="px-3 py-3 pr-5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(t)}
                        aria-label={`Edit ${t.scopeValue}`}
                      >
                        <Pencil className="size-3.5" strokeWidth={2} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {(creating || editing) && (
        <DepartmentThresholdDrawer
          threshold={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
