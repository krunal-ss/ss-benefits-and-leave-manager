// KAN-224 — Loading skeleton for the document vault segment.
export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-40 animate-pulse rounded-[14px] border bg-card" />
      <div className="h-64 animate-pulse rounded-[14px] border bg-card" />
    </div>
  );
}
