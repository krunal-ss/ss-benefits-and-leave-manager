import { requireAccess } from "@/server/auth/current-user";
import {
  listAdminUsers,
  listApproverOptions,
  listBenefitCategories,
  listHolidays,
  listLeaveTypes,
} from "@/server/admin/data";
import { AdminConsole } from "./admin-console";

export const metadata = { title: "Admin console · SmartSense" };

// KAN-49 (KAN-72 FE): the Admin console. Server Component, gated by requireAccess
// (HR-Head / Admin per MODULE_ACCESS). Loads all config data server-side, then
// hands it to a client shell of tabbed sections whose forms call the audited
// server actions in src/server/admin/actions.ts.
export default async function AdminPage() {
  const me = await requireAccess("/admin");
  const [users, approvers, categories, leaveTypes, holidays] = await Promise.all([
    listAdminUsers(),
    listApproverOptions(),
    listBenefitCategories(),
    listLeaveTypes(),
    listHolidays(),
  ]);

  return (
    <AdminConsole
      canManageUsers={me.role === "admin"}
      users={users}
      approvers={approvers}
      categories={categories}
      leaveTypes={leaveTypes}
      holidays={holidays}
    />
  );
}
