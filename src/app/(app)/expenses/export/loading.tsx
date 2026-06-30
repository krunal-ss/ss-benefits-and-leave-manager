export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-3 gap-3.5">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-96 animate-pulse rounded-[14px] bg-muted" />
    </div>
  );
}
