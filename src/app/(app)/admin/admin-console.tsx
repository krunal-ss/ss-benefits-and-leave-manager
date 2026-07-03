"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { AdminUserRow, ApproverOption } from "@/server/admin/data";
import { UsersSection } from "@/app/(app)/admin/users-section";
import { CategoriesSection } from "@/app/(app)/admin/categories-section";
import { LeaveSection } from "@/app/(app)/admin/leave-section";
import { HolidaysSection } from "@/app/(app)/admin/holidays-section";
import type { Category, LeaveType, Holiday } from "@/app/(app)/admin/admin-types";

type Tab = "users" | "categories" | "leave" | "holidays";

export function AdminConsole({
  canManageUsers,
  users,
  approvers,
  categories,
  leaveTypes,
  holidays,
}: {
  canManageUsers: boolean;
  users: AdminUserRow[];
  approvers: ApproverOption[];
  categories: Category[];
  leaveTypes: LeaveType[];
  holidays: Holiday[];
}) {
  // HR-Head sees policy tabs only; Admin also gets Users & reporting lines.
  const tabs: { value: Tab; label: string }[] = [
    ...(canManageUsers ? [{ value: "users" as Tab, label: "Users & reporting" }] : []),
    { value: "categories", label: "Benefit categories" },
    { value: "leave", label: "Leave types" },
    { value: "holidays", label: "Holidays" },
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].value);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Admin console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure {canManageUsers ? "users, reporting lines, " : ""}benefit categories, leave policy and the
          holiday calendar. Every change is recorded in the audit log.
        </p>
      </div>

      <Segmented ariaLabel="Admin section" value={tab} options={tabs} onChange={(t) => setTab(t)} />

      {tab === "users" && canManageUsers && <UsersSection users={users} approvers={approvers} />}
      {tab === "categories" && <CategoriesSection categories={categories} />}
      {tab === "leave" && <LeaveSection leaveTypes={leaveTypes} />}
      {tab === "holidays" && <HolidaysSection holidays={holidays} />}
    </div>
  );
}
