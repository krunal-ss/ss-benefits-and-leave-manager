import { cn } from "@/lib/cn";
import type { CalendarEvent } from "@/server/calendar";

export function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-left transition-colors",
        event.kind === "leave" ? "bg-blue-600/[0.13] hover:bg-blue-600/[0.22]" : "bg-violet-600/[0.14] hover:bg-violet-600/[0.24]",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", event.kind === "leave" ? "bg-blue-600" : "bg-violet-600")} />
      <span className={cn("truncate text-[10.5px] font-medium", event.kind === "leave" ? "text-blue-600" : "text-violet-600")}>
        {event.label}
      </span>
    </button>
  );
}
