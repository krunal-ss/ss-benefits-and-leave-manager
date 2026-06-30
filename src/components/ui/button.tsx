import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "destructive-outline";
type Size = "default" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "border-0 bg-primary text-primary-foreground shadow-xs",
  outline: "border bg-background text-foreground shadow-xs hover:bg-accent",
  ghost: "border-0 bg-transparent text-muted-foreground hover:bg-accent",
  "destructive-outline":
    "border border-[color-mix(in_oklab,var(--destructive)_45%,transparent)] bg-background text-destructive shadow-xs",
};

const SIZES: Record<Size, string> = {
  default: "h-10 rounded-[9px] px-4 text-[13.5px]",
  sm: "h-[30px] rounded-[7px] px-[11px] text-[12.5px]",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
