export function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-[18px] font-semibold tracking-[-0.01em]">{title}</div>
      <div className="text-[13px] text-muted-foreground">{sub}</div>
    </div>
  );
}
