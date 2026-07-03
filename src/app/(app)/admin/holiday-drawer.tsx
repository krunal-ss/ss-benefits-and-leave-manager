"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveHolidayAction } from "@/server/admin/actions";
import { Drawer } from "@/app/(app)/admin/drawer";
import { Field } from "@/app/(app)/admin/field";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { Holiday } from "@/app/(app)/admin/admin-types";

export function HolidayDrawer({ holiday, onClose }: { holiday: Holiday | null; onClose: () => void }) {
  const { save, pending } = useAdminSave();
  const [date, setDate] = useState(holiday?.date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [location, setLocation] = useState(holiday?.location ?? "");

  const submit = () =>
    save(() => saveHolidayAction({ id: holiday?.id, date, name, location: location.trim() || undefined }), onClose);

  return (
    <Drawer
      title={holiday ? `Edit ${holiday.name}` : "New holiday"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save holiday"}
          </Button>
        </>
      }
    >
      <Field label="Date">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" />
      </Field>
      <Field label="Location (blank = all)">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ahmedabad" />
      </Field>
    </Drawer>
  );
}
