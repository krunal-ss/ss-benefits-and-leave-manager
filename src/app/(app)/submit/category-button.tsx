import { cn } from "@/lib/cn";

export function CategoryButton({
  active,
  onClick,
  accent,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  accent: "emerald" | "blue";
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3.5 text-left",
        active
          ? accent === "emerald"
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-blue-600 bg-blue-600/10"
          : "border-border bg-background",
      )}
    >
      {icon}
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
