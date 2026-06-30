"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";

type ToastKind = "ok" | "warn";
type Toast = { msg: string; kind: ToastKind };

type ToastContextValue = {
  flash: (msg: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string, kind: ToastKind = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ flash }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-[11px] rounded-[10px] border bg-popover px-[18px] py-3 text-popover-foreground shadow-lg"
        >
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-white ${
              toast.kind === "ok" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          >
            {toast.kind === "ok" ? (
              <Check className="size-3" strokeWidth={3} />
            ) : (
              <CircleAlert className="size-3" strokeWidth={3} />
            )}
          </span>
          <span className="text-[13px] font-medium">{toast.msg}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
