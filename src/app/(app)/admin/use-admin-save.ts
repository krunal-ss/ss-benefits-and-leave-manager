"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers";
import type { ActionResult } from "@/server/admin/actions";

/** Wraps a mutating server action: flashes the result, refreshes on success. */
export function useAdminSave() {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
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
