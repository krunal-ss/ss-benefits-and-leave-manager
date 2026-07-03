import { cn } from "@/lib/cn";

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("border-b px-3 py-[11px] text-left font-medium first:pl-5 last:pr-5", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-3 first:pl-5 last:pr-5", className)}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
