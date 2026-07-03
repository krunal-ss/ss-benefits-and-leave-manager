import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RowActions({ onEdit, onDelete, pending }: { onEdit: () => void; onDelete: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="outline" size="sm" onClick={onEdit} disabled={pending} aria-label="Edit">
        <Pencil className="size-3.5" strokeWidth={2} />
      </Button>
      <Button variant="destructive-outline" size="sm" onClick={onDelete} disabled={pending} aria-label="Delete">
        <Trash2 className="size-3.5" strokeWidth={2} />
      </Button>
    </div>
  );
}
