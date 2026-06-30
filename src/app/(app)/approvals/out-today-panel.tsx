import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import type { OutTodayItem } from "@/server/manager/approvals";
import { cn } from "@/lib/cn";
import { kindClasses } from "./kind";

export function OutTodayPanel({ items, todayLabel }: { items: OutTodayItem[]; todayLabel: string }) {
  return (
    <Card className="sticky top-[78px] overflow-hidden">
      <div className="border-b px-5 py-4">
        <div className="text-[15px] font-semibold">Out today</div>
        <div className="text-[12.5px] text-muted-foreground">{todayLabel}</div>
      </div>

      {items.length === 0 ? (
        <div className="border-b px-5 py-8 text-center text-[13px] text-muted-foreground">
          Everyone&apos;s in today.
        </div>
      ) : (
        items.map((o) => {
          const k = kindClasses(o.kind);
          return (
            <div key={o.name} className="flex items-center gap-[11px] border-b px-5 py-3">
              <Avatar initials={o.initials} className="size-[30px] text-[11.5px]" />
              <div>
                <div className="text-[13px] font-medium">{o.name}</div>
                <div className="text-[11.5px] text-muted-foreground">{o.role}</div>
              </div>
              <span className={cn("ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium", k.text)}>
                <span className={cn("size-[7px] rounded-full", k.dot)} />
                {o.type}
              </span>
            </div>
          );
        })
      )}

      <div className="px-5 py-3.5">
        <Link
          href="/calendar"
          className="flex h-[34px] w-full items-center justify-center rounded-lg border bg-background text-[13px] font-medium shadow-xs hover:bg-accent"
        >
          Open team calendar
        </Link>
      </div>
    </Card>
  );
}
