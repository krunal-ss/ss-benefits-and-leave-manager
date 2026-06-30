"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";

/** FY picker — writes the chosen financial year to the `?fy=` search param so the
 * Server Component re-renders with the new range. */
export function FyFilter({ options, value }: { options: string[]; value: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Segmented
      ariaLabel="Financial year"
      value={value}
      options={options.map((o) => ({ value: o, label: `FY ${o}` }))}
      onChange={(fy) => {
        const next = new URLSearchParams(params.toString());
        next.set("fy", fy);
        next.delete("from");
        next.delete("to");
        router.push(`/reports?${next.toString()}`);
      }}
    />
  );
}
