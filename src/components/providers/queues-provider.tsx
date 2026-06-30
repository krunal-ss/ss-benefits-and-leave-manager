"use client";

import { createContext, useContext, useState } from "react";
import { HR_QUEUE, type QueuedClaim } from "@/server/hr-queue";

type DecisionMsg = { msg: string; ok: boolean };

type QueuesContextValue = {
  hrClaims: QueuedClaim[];
  /** Decide an HR expense claim (removes it from the queue). */
  decideClaim: (id: string, approve: boolean) => DecisionMsg;
};

const QueuesContext = createContext<QueuesContextValue | null>(null);

export function QueuesProvider({ children }: { children: React.ReactNode }) {
  const [hrClaims, setHrClaims] = useState<QueuedClaim[]>(HR_QUEUE);

  const decideClaim = (id: string, approve: boolean): DecisionMsg => {
    setHrClaims((q) => q.filter((c) => c.id !== id));
    return approve
      ? { msg: "Claim approved — employee notified", ok: true }
      : { msg: "Claim rejected — balance released", ok: false };
  };

  return (
    <QueuesContext.Provider value={{ hrClaims, decideClaim }}>{children}</QueuesContext.Provider>
  );
}

export function useQueues() {
  const ctx = useContext(QueuesContext);
  if (!ctx) throw new Error("useQueues must be used within QueuesProvider");
  return ctx;
}
