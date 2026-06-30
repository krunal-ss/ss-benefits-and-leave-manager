"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-[15px] font-semibold">Something went wrong</div>
      <p className="max-w-md text-[13px] text-muted-foreground">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <Button variant="outline" onClick={reset} className="mt-1">
        Try again
      </Button>
    </div>
  );
}
