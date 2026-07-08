"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { saveStaffingThresholdAction } from "@/server/actions/staffing-thresholds";
import type { StaffingThresholdRow } from "@/server/hr/staffing-thresholds";
import { useThresholdSave } from "@/app/(app)/settings/staffing-thresholds/use-threshold-save";

export function DepartmentThresholdDrawer({
  threshold,
  onClose,
}: {
  threshold: StaffingThresholdRow | null;
  onClose: () => void;
}) {
  const { save, pending } = useThresholdSave();
  const [department, setDepartment] = useState(threshold?.scopeValue ?? "");
  const [percent, setPercent] = useState(String(threshold?.minAvailablePercent ?? 70));

  const submit = () =>
    save(
      () =>
        saveStaffingThresholdAction({
          id: threshold?.id,
          scope: "department",
          scopeValue: department,
          minAvailablePercent: Number(percent),
        }),
      onClose,
    );

  useEscapeKey(onClose);

  const title = threshold ? `Edit ${threshold.scopeValue}` : "New department override";

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[70] flex w-[420px] max-w-[92vw] flex-col border-l bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b px-[22px] py-[18px]">
          <div className="text-base font-semibold">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] bg-muted text-muted-foreground hover:bg-accent"
          >
            <X className="size-[15px]" strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">
          <div>
            <Label htmlFor="deptName">Department</Label>
            <Input
              id="deptName"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering"
            />
          </div>
          <div>
            <Label htmlFor="deptPercent">Min available %</Label>
            <Input
              id="deptPercent"
              type="number"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2.5 border-t px-[22px] py-4">
          <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save override"}
          </Button>
        </div>
      </div>
    </>
  );
}
