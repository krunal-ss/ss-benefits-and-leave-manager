"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteHolidayAction } from "@/server/admin/actions";
import { SectionCard } from "@/app/(app)/admin/section-card";
import { Th, Td, EmptyRow } from "@/app/(app)/admin/table-cells";
import { RowActions } from "@/app/(app)/admin/row-actions";
import { HolidayDrawer } from "@/app/(app)/admin/holiday-drawer";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { Holiday } from "@/app/(app)/admin/admin-types";

export function HolidaysSection({ holidays }: { holidays: Holiday[] }) {
  const { save, pending } = useAdminSave();
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SectionCard
        title="Holiday calendar"
        count={holidays.length}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" strokeWidth={2.2} /> New holiday
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <Th>Date</Th>
                <Th>Name</Th>
                <Th>Location</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 ? (
                <EmptyRow colSpan={4}>No holidays configured. Working-day counts exclude weekends only.</EmptyRow>
              ) : (
                holidays.map((h) => (
                  <tr key={h.id} className="border-b transition-colors hover:bg-muted/55">
                    <Td className="tabular font-medium">{h.date}</Td>
                    <Td>{h.name}</Td>
                    <Td className="text-muted-foreground">{h.location ?? "All"}</Td>
                    <Td className="text-right">
                      <RowActions
                        pending={pending}
                        onEdit={() => setEditing(h)}
                        onDelete={() => {
                          if (confirm(`Delete holiday "${h.name}"?`)) save(() => deleteHolidayAction({ id: h.id }));
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
        <HolidayDrawer
          holiday={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
