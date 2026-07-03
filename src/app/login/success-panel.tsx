import { Button } from "@/components/ui/button";

export function SuccessPanel({
  icon,
  title,
  sub,
  actionLabel,
  onAction,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
  variant: "primary" | "outline";
}) {
  return (
    <div className="flex flex-col items-center gap-[13px] py-1.5 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/[0.14] text-emerald-500">
        {icon}
      </span>
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>
      </div>
      <Button variant={variant} className="mt-1 w-full" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
