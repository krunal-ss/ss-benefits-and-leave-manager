"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/providers";
import { ROLE_LABEL } from "@/server/users";
import type { AppRole } from "@/server/auth/rbac";
import type {
  AdminUserRow,
  ApproverOption,
  listBenefitCategories,
  listHolidays,
  listLeaveTypes,
} from "@/server/admin/data";
import {
  type ActionResult,
  deleteBenefitCategoryAction,
  deleteHolidayAction,
  deleteLeaveTypeAction,
  saveBenefitCategoryAction,
  saveHolidayAction,
  saveLeaveTypeAction,
  updateUserAction,
} from "@/server/admin/actions";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";

type Category = Awaited<ReturnType<typeof listBenefitCategories>>[number];
type LeaveType = Awaited<ReturnType<typeof listLeaveTypes>>[number];
type Holiday = Awaited<ReturnType<typeof listHolidays>>[number];

const ROLE_OPTIONS: AppRole[] = ["employee", "team_lead", "project_manager", "hr_head", "admin"];

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

// ---- shared helpers --------------------------------------------------------

/** Wraps a mutating server action: flashes the result, refreshes on success. */
function useSave() {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
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

function SectionCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4">
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
          {count}
        </span>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </Card>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("border-b px-3 py-[11px] text-left font-medium first:pl-5 last:pr-5", className)}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-3 first:pl-5 last:pr-5", className)}>{children}</td>;
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function RowActions({ onEdit, onDelete, pending }: { onEdit: () => void; onDelete: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="outline" size="sm" onClick={onEdit} disabled={pending} aria-label="Edit">
        <Pencil className="size-3.5" strokeWidth={2} />
      </Button>
      <Button variant="destructive-outline" size="sm" onClick={onDelete} disabled={pending} aria-label="Delete">
        <Trash2 className="size-3.5" strokeWidth={2} />
      </Button>
    </div>
  );
}

/** A right-hand drawer used by every create/edit form. */
function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-[440px] max-w-[92vw] flex-col border-l bg-card shadow-2xl">
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
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">{children}</div>
        <div className="flex gap-2.5 border-t px-[22px] py-4">{footer}</div>
      </div>
    </>
  );
}

const selectClass =
  "h-[38px] w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

// ---- 1) Users & reporting lines --------------------------------------------

function UsersSection({ users, approvers }: { users: AdminUserRow[]; approvers: ApproverOption[] }) {
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
                    <Td>{ROLE_LABEL[u.role as AppRole] ?? u.role}</Td>
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

function UserDrawer({ user, approvers, onClose }: { user: AdminUserRow; approvers: ApproverOption[]; onClose: () => void }) {
  const { save, pending } = useSave();
  const [role, setRole] = useState<AppRole>(user.role as AppRole);
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

// ---- 2) Benefit categories -------------------------------------------------

function CategoriesSection({ categories }: { categories: Category[] }) {
  const { save, pending } = useSave();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SectionCard
        title="Benefit categories & caps"
        count={categories.length}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" strokeWidth={2.2} /> New category
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <Th>Name</Th>
                <Th className="text-right">Annual cap</Th>
                <Th>FY start</Th>
                <Th>Carryover</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <EmptyRow colSpan={5}>No categories yet. Create one to start capping allowances.</EmptyRow>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} className="border-b transition-colors hover:bg-muted/55">
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="tabular text-right">{formatINR(c.annualCapPaise / 100)}</Td>
                    <Td className="text-muted-foreground">{c.fyStart}</Td>
                    <Td className="text-muted-foreground">{c.carryover ? "Yes" : "No"}</Td>
                    <Td className="text-right">
                      <RowActions
                        pending={pending}
                        onEdit={() => setEditing(c)}
                        onDelete={() => {
                          if (confirm(`Delete category "${c.name}"?`)) save(() => deleteBenefitCategoryAction({ id: c.id }));
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
        <CategoryDrawer
          category={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

function CategoryDrawer({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { save, pending } = useSave();
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

// ---- 3) Leave types --------------------------------------------------------

function LeaveSection({ leaveTypes }: { leaveTypes: LeaveType[] }) {
  const { save, pending } = useSave();
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

function LeaveTypeDrawer({ leaveType, onClose }: { leaveType: LeaveType | null; onClose: () => void }) {
  const { save, pending } = useSave();
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

// ---- 4) Holidays -----------------------------------------------------------

function HolidaysSection({ holidays }: { holidays: Holiday[] }) {
  const { save, pending } = useSave();
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

function HolidayDrawer({ holiday, onClose }: { holiday: Holiday | null; onClose: () => void }) {
  const { save, pending } = useSave();
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
