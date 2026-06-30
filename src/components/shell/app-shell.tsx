import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPendingApprovalCount } from "@/server/manager/approvals";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const approvalCount = await getPendingApprovalCount(user);

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, role: user.role }} approvalCount={approvalCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex w-full max-w-[1280px] flex-col gap-[22px] px-[30px] pt-[26px] pb-[70px]">
          {children}
        </main>
      </div>
    </div>
  );
}
