export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-[1.7fr_1fr] items-start gap-[18px]">
        <div className="flex flex-col gap-3.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-[14px] bg-muted" />
      </div>
    </div>
  );
}
