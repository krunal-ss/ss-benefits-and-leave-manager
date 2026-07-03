import { X } from "lucide-react";

/** A right-hand drawer used by every create/edit form. */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-[440px] max-w-[92vw] flex-col border-l bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-[22px] py-[18px]">
          <div className="text-base font-semibold">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] bg-muted text-muted-foreground hover:bg-accent"
          >
            <X className="size-[15px]" strokeWidth={2} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">{children}</div>
        <div className="flex gap-2.5 border-t px-[22px] py-4">{footer}</div>
      </div>
    </>
  );
}
