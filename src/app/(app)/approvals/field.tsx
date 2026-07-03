export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="text-[13.5px] font-medium">{value}</div>
    </div>
  );
}
