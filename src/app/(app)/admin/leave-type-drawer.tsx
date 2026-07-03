"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveLeaveTypeAction } from "@/server/admin/actions";
import { Drawer } from "@/app/(app)/admin/drawer";
import { Field } from "@/app/(app)/admin/field";
import { Checkbox } from "@/app/(app)/admin/checkbox";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";
import type { LeaveType } from "@/app/(app)/admin/admin-types";

export function LeaveTypeDrawer({ leaveType, onClose }: { leaveType: LeaveType | null; onClose: () => void }) {
  const { save, pending } = useAdminSave();
  const [code, setCode] = useState(leaveType?.code ?? "");
  const [name, setName] = useState(leaveType?.name ?? "");
  const [accrual, setAccrual] = useState(leaveType?.accrualPerMonthDays ?? "0");
  const [opening, setOpening] = useState(leaveType?.openingBalanceDays ?? "0");
  const [max, setMax] = useState(leaveType?.maxBalanceDays ?? "");
  const [carryForward, setCarryForward] = useState(leaveType?.carryForward ?? false);
  const [deductsBalance, setDeductsBalance] = useState(leaveType?.deductsBalance ?? true);

  const submit = () =>
    save(
      () =>
        saveLeaveTypeAction({
          id: leaveType?.id,
          code,
          name,
          accrualPerMonthDays: accrual,
          openingBalanceDays: opening,
          maxBalanceDays: max,
          carryForward,
          deductsBalance,
        }),
      onClose,
    );

  return (
    <Drawer
      title={leaveType ? `Edit ${leaveType.code}` : "New leave type"}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save leave type"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CL" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Casual Leave" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Accrual / mo">
          <Input inputMode="decimal" value={accrual} onChange={(e) => setAccrual(e.target.value)} />
        </Field>
        <Field label="Opening">
          <Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </Field>
        <Field label="Max (blank = none)">
          <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="—" />
        </Field>
      </div>
      <Checkbox label="Carry forward unused balance" checked={carryForward} onChange={setCarryForward} />
      <Checkbox label="Deducts from balance when taken" checked={deductsBalance} onChange={setDeductsBalance} />
    </Drawer>
  );
}
