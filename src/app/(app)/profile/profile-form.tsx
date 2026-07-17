"use client";

// KAN-223 — Client form for the self-service profile screen. Owns the draft
// field state, computes completion live as you type (so the percentage updates
// automatically — AC1 — before you even save), and persists through
// updateMyProfileAction, flashing the result and refreshing the derived data on
// success. The live calc mirrors MANDATORY_PROFILE_FIELDS on the server; kept
// inline here because the server module is `server-only`.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers";
import { updateMyProfileAction } from "@/server/actions/profile";

type EditableFields = {
  name: string;
  phone: string;
  department: string;
  emergencyContact: string;
};
type ReadOnlyFields = { email: string; roleLabel: string; joinDate: string | null };

const FIELDS: {
  key: keyof EditableFields;
  label: string;
  placeholder: string;
  inputMode?: "text" | "tel";
}[] = [
  { key: "name", label: "Full name", placeholder: "e.g. Priya Sharma" },
  { key: "phone", label: "Phone number", placeholder: "e.g. +91 98765 43210", inputMode: "tel" },
  { key: "department", label: "Department", placeholder: "e.g. Engineering" },
  { key: "emergencyContact", label: "Emergency contact", placeholder: "Name & phone number" },
];

export function ProfileForm({
  initial,
  readOnly,
}: {
  initial: EditableFields;
  readOnly: ReadOnlyFields;
  /** Server-computed % for the very first paint; the live value takes over immediately. */
  initialPercent: number;
}) {
  const [values, setValues] = useState<EditableFields>(initial);
  const [pending, startTransition] = useTransition();
  const { flash } = useToast();
  const router = useRouter();

  const filled = FIELDS.filter((f) => values[f.key].trim() !== "");
  const missing = FIELDS.filter((f) => values[f.key].trim() === "");
  const percent = Math.round((filled.length / FIELDS.length) * 100);
  const dirty = FIELDS.some((f) => values[f.key] !== initial[f.key]);

  function setField(key: keyof EditableFields, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = await updateMyProfileAction(values);
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="grid max-w-[1000px] grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-4"
      >
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Personal details</div>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                name={f.key}
                inputMode={f.inputMode}
                value={values[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-3.5 p-5">
          <div>
            <div className="text-[15px] font-semibold">Managed by HR</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These are set by HR — contact them to make a change.
            </p>
          </div>
          <ReadOnlyRow label="Email" value={readOnly.email} />
          <ReadOnlyRow label="Role" value={readOnly.roleLabel} />
          <ReadOnlyRow label="Joining date" value={readOnly.joinDate ?? "Not set"} />
        </Card>

        <div className="flex items-center gap-2.5">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {!dirty && percent === 100 && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-500">
              <Check className="size-[15px]" strokeWidth={2.4} />
              Profile complete
            </span>
          )}
        </div>
      </form>

      {/* Live completion summary */}
      <Card className="sticky top-[78px] flex flex-col gap-4 p-5">
        <div className="text-sm font-semibold">Profile completion</div>
        <div className="flex items-baseline gap-2">
          <span
            data-testid="profile-completion-percent"
            className="tabular text-[34px] font-semibold tracking-[-0.02em]"
          >
            {percent}%
          </span>
          <span className="text-[13px] text-muted-foreground">
            {filled.length} of {FIELDS.length} complete
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        {missing.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-muted-foreground">Still missing</div>
            <div className="flex flex-wrap gap-2">
              {missing.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => document.getElementById(f.key)?.focus()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {f.label}
                  <ArrowRight className="size-3" strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12.5px] font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-[15px]" strokeWidth={2.4} />
            All set — your profile is complete.
          </div>
        )}
      </Card>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
