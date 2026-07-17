import { requireAccess } from "@/server/auth/current-user";
import { computeProfileCompletion } from "@/server/employee/profile";
import { ROLE_LABEL } from "@/server/users";
import { formatDateLong } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My profile · SmartSense" };

// KAN-223 — Self-service profile screen (the first employee-owned edit surface).
// Server Component, gated by requireAccess (all roles). Loads the caller's own
// row and hands the editable fields + read-only HR-managed fields to a client
// form that persists through updateMyProfileAction. Completion % is derived, not
// stored — computed here for the initial render and live in the form as you type.
export default async function ProfilePage() {
  const user = await requireAccess("/profile");
  const completion = computeProfileCompletion(user);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">My profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your details up to date so approvals and records stay accurate.
        </p>
      </div>
      <ProfileForm
        initial={{
          name: user.name,
          phone: user.phone ?? "",
          department: user.department ?? "",
          emergencyContact: user.emergencyContact ?? "",
        }}
        readOnly={{
          email: user.email,
          roleLabel: ROLE_LABEL[user.role],
          joinDate: user.joinDate ? formatDateLong(user.joinDate) : null,
        }}
        initialPercent={completion.percent}
      />
    </div>
  );
}
