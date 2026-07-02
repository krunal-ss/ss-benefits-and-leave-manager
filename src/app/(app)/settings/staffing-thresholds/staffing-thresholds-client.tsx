"use client";

// KAN-74 — Client shell for the staffing-thresholds config screen: the
// org-wide default (single row, edited in place) plus a table of per-department
// overrides (create/edit via a drawer). Mirrors the admin console's
// list+drawer CRUD pattern (src/app/(app)/admin/admin-console.tsx).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/providers";
import {
  saveStaffingThresholdAction,
  type SaveThresholdResult,
} from "@/server/actions/staffing-thresholds";
import type { StaffingThresholdRow } from "@/server/hr/staffing-thresholds";

/** Wraps the save Server Action: flashes the result, refreshes the list on success. */
function useSave() {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (fn: () => Promise<SaveThresholdResult>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { save, pending };
}

export function StaffingThresholdsClient({
  orgDefault,
  departmentOverrides,
}: {
  orgDefault: StaffingThresholdRow | null;
  departmentOverrides: StaffingThresholdRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <OrgDefaultCard orgDefault={orgDefault} />
      <DepartmentOverridesCard overrides={departmentOverrides} />
    </div>
  );
}

// ---- Org-wide default (single row, edited in place) ------------------------

function OrgDefaultCard({ orgDefault }: { orgDefault: StaffingThresholdRow | null }) {
  const { save, pending } = useSave();
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

// ---- Department overrides (list + drawer) ----------------------------------

function DepartmentOverridesCard({ overrides }: { overrides: StaffingThresholdRow[] }) {
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

function DepartmentThresholdDrawer({
  threshold,
  onClose,
}: {
  threshold: StaffingThresholdRow | null;
  onClose: () => void;
}) {
  const { save, pending } = useSave();
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

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-[420px] max-w-[92vw] flex-col border-l bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-[22px] py-[18px]">
          <div className="text-base font-semibold">
            {threshold ? `Edit ${threshold.scopeValue}` : "New department override"}
          </div>
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
