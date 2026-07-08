"use client";

// KAN-185 — Quick Search command palette (⌘K / Ctrl+K), opened from the
// header. Debounced calls into the RBAC-scoped searchAction; "View all
// results" hands the query off to the full /search page.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, FileText, Search, User as UserIcon } from "lucide-react";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { searchAction } from "@/server/actions/search";
import type { SearchResults } from "@/server/search";

const EMPTY: SearchResults = { leaves: [], claims: [], people: [], policies: [] };
const DEBOUNCE_MS = 250;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  useEscapeKey(onClose);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(EMPTY);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      const res = await searchAction(q);
      if (requestSeq.current === seq) {
        setResults(res);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const total = results.leaves.length + results.claims.length + results.people.length + results.policies.length;
  const trimmed = query.trim();

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function viewAll() {
    onClose();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center bg-black/40 p-6 pt-[88px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[76vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <Search className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) viewAll();
            }}
            placeholder="Search leave, claims, people, policies…"
            className="flex-1 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded-[5px] border border-border bg-muted px-1.5 py-1 font-mono text-[10.5px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {!trimmed ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">
              Start typing to search across leave, claims, people and policies.
            </div>
          ) : loading ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">Searching…</div>
          ) : total === 0 ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">
              No results. Press Enter to open full search.
            </div>
          ) : (
            <>
              <ResultGroup label="Leave requests" icon={CalendarDays} items={results.leaves} onOpen={go} />
              <ResultGroup label="Expense claims" icon={FileText} items={results.claims} onOpen={go} />
              <ResultGroup label="People" icon={UserIcon} items={results.people} onOpen={go} />
              <ResultGroup label="Policies" icon={Briefcase} items={results.policies} onOpen={go} />
            </>
          )}
        </div>

        {trimmed && (
          <button
            onClick={viewAll}
            className="flex items-center gap-2 border-t border-border bg-muted px-4 py-3 text-left text-[12.5px] font-medium text-foreground hover:bg-accent"
          >
            <Search className="size-3.5" strokeWidth={2} />
            View all results
            <kbd className="ml-auto rounded-[5px] border border-border bg-background px-1.5 py-1 font-mono text-[10.5px] font-medium text-muted-foreground">
              Enter
            </kbd>
          </button>
        )}
      </div>
    </div>
  );
}

function ResultGroup({
  label,
  icon: Icon,
  items,
  onOpen,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: SearchResults["leaves"];
  onOpen: (href: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.03em] text-muted-foreground uppercase">
        {label}
      </div>
      {items.map((row) => (
        <button
          key={row.id}
          onClick={() => onOpen(row.href)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-accent"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{row.title}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">
              {[row.subtitle, row.who].filter(Boolean).join(" · ")}
            </div>
          </div>
          {row.statusLabel && <span className="shrink-0 text-[11px] text-muted-foreground">{row.statusLabel}</span>}
        </button>
      ))}
    </div>
  );
}
