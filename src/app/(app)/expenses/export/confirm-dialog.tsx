import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  fy,
  count,
  totalLabel,
  onCancel,
  onConfirm,
}: {
  fy: string;
  count: number;
  totalLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} className="fixed inset-0 z-[60] bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm reimbursement payout"
        className="fixed left-1/2 top-1/2 z-[70] w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border bg-card p-6 shadow-2xl"
      >
        <div className="text-base font-semibold">Mark FY {fy} reimbursed?</div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This transitions {count} claim{count === 1 ? "" : "s"} totalling {totalLabel} to{" "}
          <span className="font-medium text-foreground">Reimbursed</span> and logs the batch to the audit trail. It cannot be
          undone from here.
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Confirm payout</Button>
        </div>
      </div>
    </>
  );
}
