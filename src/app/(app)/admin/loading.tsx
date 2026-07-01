export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
      <div className="h-8 w-80 animate-pulse rounded-lg bg-muted" />
      <div className="h-96 animate-pulse rounded-[14px] bg-muted" />
    </div>
  );
}
