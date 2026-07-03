import { notFound } from "next/navigation";
import { requireAccess } from "@/server/auth/current-user";
import { getReceiptIntelligence } from "@/server/hr/expenses";
import { ReceiptIntelligenceClient } from "./receipt-intelligence-client";

export const metadata = { title: "Receipt intelligence · SmartSense" };

export default async function ReceiptIntelligencePage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const user = await requireAccess("/expenses");
  const { claimId } = await params;
  const intel = await getReceiptIntelligence(user, claimId);
  if (!intel) notFound();

  return <ReceiptIntelligenceClient intel={intel} />;
}
