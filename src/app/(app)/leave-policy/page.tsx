import { requireAccess } from "@/server/auth/current-user";
import { getLeavePolicies } from "@/server/policy";
import { LeavePolicyClient } from "./leave-policy-client";

export const metadata = { title: "Leave policies · SmartSense" };

export default async function LeavePolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string }>;
}) {
  await requireAccess("/leave-policy");
  const policies = await getLeavePolicies();
  const { policy } = await searchParams;

  return <LeavePolicyClient policies={policies} initialSelectedId={policy ?? null} />;
}
