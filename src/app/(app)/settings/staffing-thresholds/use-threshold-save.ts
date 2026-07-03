"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers";
import type { SaveThresholdResult } from "@/server/actions/staffing-thresholds";

/** Wraps the save Server Action: flashes the result, refreshes the list on success. */
export function useThresholdSave() {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (fn: () => Promise<SaveThresholdResult>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        onOk?.();
        router.refresh();
      }
    });
  return { save, pending };
}
