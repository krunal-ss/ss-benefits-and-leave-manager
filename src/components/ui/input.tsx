import { cn } from "@/lib/cn";

export const fieldBaseClass =
  "w-full bg-background text-foreground border border-input rounded-lg shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBaseClass, "h-[38px] px-3 text-sm", className)} {...props} />;
}
