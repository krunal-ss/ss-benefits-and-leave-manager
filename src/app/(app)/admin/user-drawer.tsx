"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL } from "@/server/users";
import type { AppRole } from "@/server/auth/rbac";
import type { AdminUserRow, ApproverOption } from "@/server/admin/data";
import { updateUserAction } from "@/server/admin/actions";
import { Drawer } from "@/app/(app)/admin/drawer";
import { Field } from "@/app/(app)/admin/field";
import { selectClass } from "@/app/(app)/admin/admin-select-class";
import { useAdminSave } from "@/app/(app)/admin/use-admin-save";

const ROLE_OPTIONS: AppRole[] = ["employee", "team_lead", "project_manager", "hr_head", "admin"];

export function UserDrawer({ user, approvers, onClose }: { user: AdminUserRow; approvers: ApproverOption[]; onClose: () => void }) {
  const { save, pending } = useAdminSave();
  const [role, setRole] = useState<AppRole>(user.role);
  const [department, setDepartment] = useState(user.department ?? "");
  const [teamLeadId, setTeamLeadId] = useState(user.teamLeadId ?? "");
  const [projectManagerId, setProjectManagerId] = useState(user.projectManagerId ?? "");
  // Can't be your own approver.
  const others = approvers.filter((a) => a.id !== user.id);

  const submit = () =>
    save(
      () =>
        updateUserAction({
          userId: user.id,
          role,
          department: department.trim() || undefined,
          teamLeadId: teamLeadId || null,
          projectManagerId: projectManagerId || null,
        }),
      onClose,
    );

  return (
    <Drawer
      title={`Edit ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="text-[12.5px] text-muted-foreground">{user.email}</div>
      <Field label="Role">
        <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Department">
        <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
      </Field>
      <Field label="Team Lead (L1 approver)">
        <select className={selectClass} value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)}>
          <option value="">— None —</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Project Manager (L2 approver)">
        <select className={selectClass} value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)}>
          <option value="">— None —</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
    </Drawer>
  );
}
