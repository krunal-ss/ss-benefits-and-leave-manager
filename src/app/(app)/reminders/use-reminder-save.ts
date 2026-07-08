"use client";

// KAN-148 — Wraps the save/test Server Actions: flashes the result via the
// toast provider, refreshes the page data on a successful save. Mirrors
// src/app/(app)/settings/staffing-thresholds/use-threshold-save.ts, generalised
// to the shared { ok, message } result shape used by both actions here.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers";

type ActionResult = { ok: boolean; message: string };

export function useReminderSave() {
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
