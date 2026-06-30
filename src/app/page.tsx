import { redirect } from "next/navigation";

// Employee is the default role; its home is the dashboard.
export default function RootPage() {
  redirect("/dashboard");
}
