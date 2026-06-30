export default function Loading() {
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-[18px]">
        <div className="h-40 animate-pulse rounded-[14px] bg-muted" />
        <div className="h-40 animate-pulse rounded-[14px] bg-muted" />
      </div>
      <div className="grid grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
