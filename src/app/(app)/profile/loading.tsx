// KAN-223 — Loading skeleton for the profile screen segment.
export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid max-w-[1000px] grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-[14px] border bg-card" />
          <div className="h-40 animate-pulse rounded-[14px] border bg-card" />
        </div>
        <div className="h-52 animate-pulse rounded-[14px] border bg-card" />
      </div>
    </div>
  );
}
