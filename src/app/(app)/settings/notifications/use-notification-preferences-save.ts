"use client";

// KAN-168 — Wraps updateNotificationPreferencesAction: flashes the result via
// the toast provider, refreshes the page data on success. Mirrors
// src/app/(app)/reminders/use-reminder-save.ts.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers";

type ActionResult = { ok: boolean; message: string };

export function useNotificationPreferencesSave() {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        onOk?.();
        router.refresh();
      }
    });

  return { run, pending };
}
