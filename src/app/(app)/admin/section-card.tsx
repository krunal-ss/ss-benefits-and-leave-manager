import { Card } from "@/components/ui/card";

export function SectionCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b px-5 py-4">
        <div className="text-[15px] font-semibold">{title}</div>
        <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
          {count}
        </span>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </Card>
  );
}
