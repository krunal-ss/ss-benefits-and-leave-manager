import { cn } from "@/lib/cn";
import { fieldBaseClass } from "@/components/ui/input";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldBaseClass, "min-h-[72px] resize-y px-3 py-[9px] text-sm font-sans", className)}
      {...props}
    />
  );
}
