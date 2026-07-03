"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/server/users";
import type { AdminUserRow, ApproverOption } from "@/server/admin/data";
import { SectionCard } from "@/app/(app)/admin/section-card";
import { Th, Td, EmptyRow } from "@/app/(app)/admin/table-cells";
import { UserDrawer } from "@/app/(app)/admin/user-drawer";

export function UsersSection({ users, approvers }: { users: AdminUserRow[]; approvers: ApproverOption[] }) {
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const nameFor = (id: string | null) => approvers.find((a) => a.id === id)?.name ?? "—";

  return (
    <>
      <SectionCard title="Users & reporting lines" count={users.length} action={null}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Team Lead</Th>
                <Th>Project Manager</Th>
                <Th className="text-right">Edit</Th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <EmptyRow colSpan={6}>No users yet.</EmptyRow>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b transition-colors hover:bg-muted/55">
                    <Td>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">{u.email}</div>
                    </Td>
                    <Td>{ROLE_LABEL[u.role] ?? u.role}</Td>
                    <Td className="text-muted-foreground">{u.department ?? "—"}</Td>
                    <Td className="text-muted-foreground">{nameFor(u.teamLeadId)}</Td>
                    <Td className="text-muted-foreground">{nameFor(u.projectManagerId)}</Td>
                    <Td className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {editing && <UserDrawer user={editing} approvers={approvers} onClose={() => setEditing(null)} />}
    </>
  );
}
