export function Switcher({ prompt, action, onClick }: { prompt: string; action: string; onClick: () => void }) {
  return (
    <div className="text-center text-[13px] text-muted-foreground">
      {prompt}{" "}
      <button onClick={onClick} className="cursor-pointer font-medium text-foreground underline underline-offset-2">
        {action}
      </button>
    </div>
  );
}
