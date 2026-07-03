"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveStaffingThresholdAction } from "@/server/actions/staffing-thresholds";
import type { StaffingThresholdRow } from "@/server/hr/staffing-thresholds";
import { useThresholdSave } from "@/app/(app)/settings/staffing-thresholds/use-threshold-save";

export function OrgDefaultCard({ orgDefault }: { orgDefault: StaffingThresholdRow | null }) {
  const { save, pending } = useThresholdSave();
  const [editing, setEditing] = useState(false);
  const [percent, setPercent] = useState(String(orgDefault?.minAvailablePercent ?? 70));

  const submit = () =>
    save(
      () =>
        saveStaffingThresholdAction({
          id: orgDefault?.id,
          scope: "org",
          minAvailablePercent: Number(percent),
        }),
      () => setEditing(false),
    );

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">Org-wide default</div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Applies to every department unless a department override below takes precedence.
          </p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" strokeWidth={2} />
            {orgDefault ? "Edit default" : "Set default"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex items-end gap-2.5">
          <div className="w-32">
            <Label htmlFor="orgPercent">Min available %</Label>
            <Input
              id="orgPercent"
              type="number"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save default"}
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="text-[22px] font-semibold tabular">
          {orgDefault ? `${orgDefault.minAvailablePercent}%` : "Not set"}
        </div>
      )}
    </Card>
  );
}
