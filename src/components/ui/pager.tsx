import Link from "next/link";
import { cn } from "@/lib/cn";

// KAN-70: minimal Prev/Next pager for paginated list pages. Server-rendered — it
// just links to the same route with an updated `?page=`. Renders nothing when the
// list fits on a single page (page 1 and no more rows).

type PagerProps = {
  /** Route to link back to, e.g. "/submit" or "/expenses/history". */
  basePath: string;
  page: number; // 1-based current page
  hasMore: boolean;
  /** Extra query params to preserve on the links (e.g. a filter). */
  params?: Record<string, string | undefined>;
  className?: string;
};

function href(basePath: string, page: number, params?: PagerProps["params"]): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}

export function Pager({ basePath, page, hasMore, params, className }: PagerProps) {
  const hasPrev = page > 1;
  if (!hasPrev && !hasMore) return null;

  const linkCls =
    "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted";
  const disabledCls =
    "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium text-muted-foreground opacity-50 pointer-events-none";

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-[12.5px] text-muted-foreground">Page {page}</span>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link href={href(basePath, page - 1, params)} className={linkCls} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={disabledCls}>← Previous</span>
        )}
        {hasMore ? (
          <Link href={href(basePath, page + 1, params)} className={linkCls} rel="next">
            Next →
          </Link>
        ) : (
          <span className={disabledCls}>Next →</span>
        )}
      </div>
    </div>
  );
}
