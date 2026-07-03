"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteLeaveTypeAction } from "@/server/admin/actions";
import { SectionCard } from "@/app/(app)/admin/section-card";
import { Th, Td, EmptyRow } from "@/app/(app)/admin/table-cells";
import { RowActions } from "@/app/(app)/admin/row-actions";
import { LeaveTypeDrawer } from "@/app/(app)/admin/leave-type-drawer";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { LeaveType } from "@/app/(app)/admin/admin-types";

export function LeaveSection({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const { save, pending } = useAdminSave();
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SectionCard
        title="Leave types & accrual"
        count={leaveTypes.length}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" strokeWidth={2.2} /> New leave type
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <Th>Code</Th>
                <Th>Name</Th>
                <Th className="text-right">Accrual / mo</Th>
                <Th className="text-right">Opening</Th>
                <Th className="text-right">Max</Th>
                <Th>Carry fwd</Th>
                <Th>Deducts</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.length === 0 ? (
                <EmptyRow colSpan={8}>No leave types yet.</EmptyRow>
              ) : (
                leaveTypes.map((t) => (
                  <tr key={t.id} className="border-b transition-colors hover:bg-muted/55">
                    <Td className="font-medium">{t.code}</Td>
                    <Td>{t.name}</Td>
                    <Td className="tabular text-right">{t.accrualPerMonthDays}</Td>
                    <Td className="tabular text-right">{t.openingBalanceDays}</Td>
                    <Td className="tabular text-right text-muted-foreground">{t.maxBalanceDays ?? "—"}</Td>
                    <Td className="text-muted-foreground">{t.carryForward ? "Yes" : "No"}</Td>
                    <Td className="text-muted-foreground">{t.deductsBalance ? "Yes" : "No"}</Td>
                    <Td className="text-right">
                      <RowActions
                        pending={pending}
                        onEdit={() => setEditing(t)}
                        onDelete={() => {
                          if (confirm(`Delete leave type "${t.code}"?`)) save(() => deleteLeaveTypeAction({ id: t.id }));
                        }}
                      />
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {(editing || creating) && (
        <LeaveTypeDrawer
          leaveType={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
