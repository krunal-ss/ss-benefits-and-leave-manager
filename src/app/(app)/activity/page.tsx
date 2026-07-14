import { requireAccess } from "@/server/auth/current-user";
import { getRecentActivity } from "@/server/employee/activity-feed";
import { currentFy } from "@/lib/fy";
import { ActivityClient } from "./activity-client";

export const metadata = { title: "Recent activity · SmartSense" };

export default async function ActivityPage() {
  const user = await requireAccess("/activity");
  const fy = currentFy().label;
  const items = await getRecentActivity(user.id, fy);

  return <ActivityClient items={items} />;
}
