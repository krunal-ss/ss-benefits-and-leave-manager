"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBenefitCategoryAction } from "@/server/admin/actions";
import { Drawer } from "@/app/(app)/admin/drawer";
import { Field } from "@/app/(app)/admin/field";
import { Checkbox } from "@/app/(app)/admin/checkbox";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { Category } from "@/app/(app)/admin/admin-types";

export function CategoryDrawer({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { save, pending } = useAdminSave();
  const [name, setName] = useState(category?.name ?? "");
  const [capRupees, setCapRupees] = useState(category ? String(Math.round(category.annualCapPaise / 100)) : "");
  const [fyStart, setFyStart] = useState(category?.fyStart ?? "04-01");
  const [carryover, setCarryover] = useState(category?.carryover ?? false);

  const submit = () =>
    save(
      () =>
        saveBenefitCategoryAction({
          id: category?.id,
          name,
          annualCapRupees: capRupees,
          fyStart,
          carryover,
        }),
      onClose,
    );

  return (
    <Drawer
      title={category ? `Edit ${category.name}` : "New benefit category"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save category"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sports" />
      </Field>
      <Field label="Annual cap (₹)">
        <Input
          inputMode="numeric"
          value={capRupees}
          onChange={(e) => setCapRupees(e.target.value)}
          placeholder="e.g. 15000"
        />
      </Field>
      <Field label="FY start (MM-DD)">
        <Input value={fyStart} onChange={(e) => setFyStart(e.target.value)} placeholder="04-01" />
      </Field>
      <Checkbox label="Carry unused balance into the next FY" checked={carryover} onChange={setCarryover} />
    </Drawer>
  );
}
