export default function Loading() {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-[520px] animate-pulse rounded-[14px] bg-muted" />
    </div>
  );
}
