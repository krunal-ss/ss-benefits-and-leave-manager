"use client";

// KAN-185 — full /search page: same RBAC-scoped results as the command
// palette, with a scope tablist and a persistent query so the URL is
// shareable/bookmarkable (?q=...).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarDays, FileText, Search, User as UserIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { searchAction } from "@/server/actions/search";
import type { SearchResults } from "@/server/search";

type Scope = "all" | "leave" | "claims" | "people" | "policies";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "leave", label: "Leave requests" },
  { value: "claims", label: "Expense claims" },
  { value: "people", label: "People" },
  { value: "policies", label: "Policies" },
];

const DEBOUNCE_MS = 300;

export function SearchClient({
  initialQuery,
  initialResults,
}: {
  initialQuery: string;
  initialResults: SearchResults;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults>(initialResults);
  const [scope, setScope] = useState<Scope>("all");
  const requestSeq = useRef(0);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const q = query.trim();
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false });
    if (!q) {
      setResults({ leaves: [], claims: [], people: [], policies: [] });
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      const res = await searchAction(q);
      if (requestSeq.current === seq) setResults(res);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const total = results.leaves.length + results.claims.length + results.people.length + results.policies.length;
  const showLeaves = scope === "all" || scope === "leave";
  const showClaims = scope === "all" || scope === "claims";
  const showPeople = scope === "all" || scope === "people";
  const showPolicies = scope === "all" || scope === "policies";

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Across leave requests, expense claims, people and policies.</p>
      </div>

      <div className="flex h-11 items-center gap-2.5 rounded-[10px] border border-input bg-background px-3.5 shadow-xs">
        <Search className="size-[17px] shrink-0 text-muted-foreground" strokeWidth={2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything…"
          className="h-full flex-1 border-0 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented ariaLabel="Search scope" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        {query.trim() && <span className="ml-auto text-[12.5px] text-muted-foreground">{total} result{total === 1 ? "" : "s"}</span>}
      </div>

      {!query.trim() ? (
        <Card className="flex flex-col items-center gap-3 py-[60px] text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Search className="size-[21px]" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[14.5px] font-medium">Type to search</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">Try a name, vendor, leave type, or a policy question.</div>
          </div>
        </Card>
      ) : total === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-[60px] text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Search className="size-[21px]" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[14.5px] font-medium">No matches</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">Try a different term, or switch the filter above.</div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {showLeaves && (
            <ResultSection label="Leave requests" count={results.leaves.length} icon={CalendarDays}>
              {results.leaves.map((row) => (
                <ResultRow key={row.id} row={row} />
              ))}
            </ResultSection>
          )}
          {showClaims && (
            <ResultSection label="Expense claims" count={results.claims.length} icon={FileText}>
              {results.claims.map((row) => (
                <ResultRow key={row.id} row={row} />
              ))}
            </ResultSection>
          )}
          {showPeople && (
            <ResultSection label="People" count={results.people.length} icon={UserIcon}>
              {results.people.map((row) => (
                <ResultRow key={row.id} row={row} />
              ))}
            </ResultSection>
          )}
          {showPolicies && (
            <ResultSection label="Policies" count={results.policies.length} icon={Briefcase}>
              {results.policies.map((row) => (
                <ResultRow key={row.id} row={row} />
              ))}
            </ResultSection>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({
  label,
  count,
  icon: Icon,
  children,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.02em] text-muted-foreground uppercase">
        <Icon className="size-[13px]" strokeWidth={2} />
        {label} · {count}
      </div>
      <Card className="overflow-hidden py-0">{children}</Card>
    </div>
  );
}

function ResultRow({ row }: { row: SearchResults["leaves"][number] }) {
  return (
    <a
      href={row.href}
      className="flex items-center gap-3.5 border-b border-border px-[18px] py-[13px] last:border-b-0 hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{row.title}</div>
        <div className="text-xs text-muted-foreground">{[row.subtitle, row.who].filter(Boolean).join(" · ")}</div>
      </div>
      {row.statusLabel && (
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {row.statusLabel}
        </span>
      )}
    </a>
  );
}
