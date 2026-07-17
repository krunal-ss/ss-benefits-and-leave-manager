// KAN-225 — Loading skeleton for the delegation settings segment.
export default function DelegationLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-52 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid max-w-[1000px] grid-cols-1 gap-[18px] lg:grid-cols-[1fr_1.3fr]">
        <div className="h-80 animate-pulse rounded-[14px] border bg-card" />
        <div className="h-64 animate-pulse rounded-[14px] border bg-card" />
      </div>
    </div>
  );
}
