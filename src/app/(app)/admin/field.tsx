"use client";

import { cloneElement, isValidElement, useId, type ReactElement } from "react";
import { Label } from "@/components/ui/label";

type Identifiable = { id?: string };

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const control = isValidElement<Identifiable>(children)
    ? cloneElement(children as ReactElement<Identifiable>, { id })
    : children;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  );
}
