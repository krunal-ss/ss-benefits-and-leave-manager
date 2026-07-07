"use client";

// KAN-146 — Wallet Transaction History: a filterable ledger of the employee's
// own benefit-wallet events, with a running balance, search/filter, CSV
// export, and a click-through detail drawer. All filtering happens client-side
// over the already-fetched, per-FY event list from getWalletLedger — small
// and bounded (one employee, one FY), so no server round-trips per filter.
import { useEffect, useMemo, useState } from "react";
import { Download, Search, Wallet, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import type { CategoryKey } from "@/server/benefits";
import type { LedgerEvent, LedgerEventType } from "@/server/employee/ledger";

const TYPE_META: Record<LedgerEventType, { label: string; badgeCls: string; amountCls: string }> = {
  credit: { label: "Credit", badgeCls: "bg-emerald-500/15 text-emerald-500", amountCls: "text-emerald-500" },
  debit: { label: "Debit", badgeCls: "bg-muted text-foreground", amountCls: "text-foreground" },
  reserved: { label: "Reserved", badgeCls: "bg-amber-500/15 text-[#b45309]", amountCls: "text-foreground" },
  released: { label: "Released", badgeCls: "bg-emerald-500/15 text-emerald-500", amountCls: "text-emerald-500" },
};

const CAT_DOT: Record<CategoryKey, string> = {
  sports: "bg-emerald-500",
  learning: "bg-blue-600",
};

type CatFilter = "all" | CategoryKey;
type TypeFilter = "all" | "credit" | "debit" | "reserved";

function fmtLedgerDate(iso: string): string {
  // Both a bare "YYYY-MM-DD" allocation date and a full claim timestamp share
  // this 10-char date prefix — slice it so both parse the same way.
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtSignedINR(amountPaise: number): string {
  if (amountPaise === 0) return formatINR(0);
  const sign = amountPaise > 0 ? "+ " : "− ";
  return sign + formatINR(Math.abs(amountPaise) / 100);
}

/** Escape one CSV field per RFC 4180 (quote when it holds a comma, quote, or newline). */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: LedgerEvent[], fy: string) {
  const headers = ["Date", "Description", "Reference", "Benefit", "Type", "Amount (INR)", "Balance (INR)"];
  const lines = [headers.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.dateIso.slice(0, 10)),
        csvField(r.description),
        csvField(r.ref),
        csvField(r.categoryLabel),
        csvField(TYPE_META[r.type].label),
        csvField((r.amountPaise / 100).toFixed(2)),
        csvField((r.balancePaise / 100).toFixed(2)),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wallet-ledger-${fy}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function WalletLedger({ events, fy }: { events: LedgerEvent[]; fy: string }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CatFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [active, setActive] = useState<LedgerEvent | null>(null);

  const walletBalancePaise = events[0]?.balancePaise ?? 0;
  const totalCreditedPaise = events.filter((e) => e.amountPaise > 0).reduce((a, e) => a + e.amountPaise, 0);
  const totalDebitedPaise = events.filter((e) => e.type === "debit").reduce((a, e) => a + Math.abs(e.amountPaise), 0);
  const totalReservedPaise = events.filter((e) => e.type === "reserved").reduce((a, e) => a + Math.abs(e.amountPaise), 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (cat !== "all" && e.categoryKey !== cat) return false;
      if (type === "credit" && !(e.type === "credit" || e.type === "released")) return false;
      if (type === "debit" && e.type !== "debit") return false;
      if (type === "reserved" && e.type !== "reserved") return false;
      if (q && !(e.description.toLowerCase().includes(q) || e.ref.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [events, query, cat, type]);

  const filtersActive = query.trim() !== "" || cat !== "all" || type !== "all";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-4 gap-3.5">
        <Card className="p-[15px_17px]">
          <div className="text-xs text-muted-foreground">Wallet balance</div>
          <div className="mt-[3px] text-[22px] font-semibold tracking-[-0.01em] tabular-nums">{formatINR(walletBalancePaise / 100)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">Available across benefits</div>
        </Card>
        <Card className="p-[15px_17px]">
          <div className="text-xs text-muted-foreground">Credited</div>
          <div className="mt-[3px] text-[22px] font-semibold tracking-[-0.01em] tabular-nums text-emerald-500">
            {formatINR(totalCreditedPaise / 100)}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">Allocations &amp; releases</div>
        </Card>
        <Card className="p-[15px_17px]">
          <div className="text-xs text-muted-foreground">Spent</div>
          <div className="mt-[3px] text-[22px] font-semibold tracking-[-0.01em] tabular-nums">{formatINR(totalDebitedPaise / 100)}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">Approved claims</div>
        </Card>
        <Card className="p-[15px_17px]">
          <div className="text-xs text-muted-foreground">Reserved</div>
          <div className="mt-[3px] text-[22px] font-semibold tracking-[-0.01em] tabular-nums text-[#b45309]">
            {formatINR(totalReservedPaise / 100)}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">Pending holds</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-[18px] py-3.5">
          <div className="text-[15px] font-semibold">Transaction history</div>
          <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
            {filtered.length} shown
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <div className="relative inline-flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search description or ref…"
                className="h-[34px] w-[210px] rounded-lg border border-input bg-background pl-8 pr-3 text-[13px] text-foreground shadow-xs outline-none"
              />
            </div>
            <button
              onClick={() => downloadCsv(filtered, fy)}
              disabled={filtered.length === 0}
              className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-b border-border px-[18px] py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">Benefit</span>
            <Segmented
              ariaLabel="Filter by benefit"
              value={cat}
              onChange={setCat}
              options={[
                { value: "all", label: "All" },
                { value: "sports", label: "Sports" },
                { value: "learning", label: "Learning" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">Type</span>
            <Segmented
              ariaLabel="Filter by type"
              value={type}
              onChange={setType}
              options={[
                { value: "all", label: "All" },
                { value: "credit", label: "Credit" },
                { value: "debit", label: "Debit" },
                { value: "reserved", label: "Reserved" },
              ]}
            />
          </div>
          {filtersActive && (
            <button
              onClick={() => {
                setQuery("");
                setCat("all");
                setType("all");
              }}
              className="ml-auto cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:bg-accent"
            >
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Search className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <div className="text-sm font-medium">No matching transactions</div>
            <div className="text-[12.5px] text-muted-foreground">Try changing the filters above.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="border-b border-border px-[18px] py-2.5 font-medium">Date</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">Description</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">Benefit</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">Type</th>
                  <th className="border-b border-border px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="border-b border-border px-[18px] py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setActive(e)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setActive(e);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <td className="px-[18px] py-3 whitespace-nowrap text-muted-foreground">{fmtLedgerDate(e.dateIso)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{e.description}</div>
                      <div className="font-mono text-[11.5px] text-muted-foreground">{e.ref}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("size-[7px] rounded-[2px]", CAT_DOT[e.categoryKey])} />
                        {e.categoryLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex h-[21px] items-center rounded-md px-2 text-[11px] font-medium", TYPE_META[e.type].badgeCls)}>
                        {TYPE_META[e.type].label}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap", TYPE_META[e.type].amountCls)}>
                      {fmtSignedINR(e.amountPaise)}
                    </td>
                    <td className="px-[18px] py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      {formatINR(e.balancePaise / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active && <TxnDrawer event={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function TxnDrawer({ event, onClose }: { event: LedgerEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = TYPE_META[event.type];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction detail"
        className="fixed top-0 right-0 bottom-0 z-[60] flex w-full max-w-[400px] flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-[22px] py-[18px]">
          <div>
            <div className="text-base font-semibold">Transaction detail</div>
            <div className="font-mono text-[12.5px] text-muted-foreground">{event.ref}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted text-muted-foreground outline-none hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-[22px]">
          <div className="flex flex-col items-center gap-1.5 pt-2.5 pb-1">
            <span className={cn("inline-flex h-[22px] items-center rounded-md px-2.5 text-[11.5px] font-semibold", meta.badgeCls)}>
              {meta.label}
            </span>
            <div className={cn("text-[30px] font-bold tracking-[-0.02em] tabular-nums", meta.amountCls)}>
              {fmtSignedINR(event.amountPaise)}
            </div>
            <div className="text-[12.5px] text-muted-foreground">Balance after · {formatINR(event.balancePaise / 100)}</div>
          </div>

          <div className="flex flex-col text-[13px]">
            <div className="flex justify-between border-t border-border py-[11px]">
              <span className="text-muted-foreground">Description</span>
              <span className="text-right font-medium">{event.description}</span>
            </div>
            <div className="flex justify-between border-t border-border py-[11px]">
              <span className="text-muted-foreground">Benefit</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className={cn("size-[7px] rounded-[2px]", CAT_DOT[event.categoryKey])} />
                {event.categoryLabel}
              </span>
            </div>
            <div className="flex justify-between border-t border-border py-[11px]">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{fmtLedgerDate(event.dateIso)}</span>
            </div>
            <div className="flex justify-between border-t border-border py-[11px]">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono font-medium whitespace-nowrap">{event.ref}</span>
            </div>
            <div className="flex justify-between gap-5 border-t border-b border-border py-[11px]">
              <span className="shrink-0 text-muted-foreground">Source</span>
              <span className="text-right font-medium">{event.method}</span>
            </div>
          </div>

          {event.isClaim && (
            <div className="flex items-center gap-2.5 rounded-lg bg-muted px-[13px] py-[11px] text-[12.5px] text-muted-foreground">
              <Wallet className="size-3.5 shrink-0" />
              Linked to expense claim {event.ref} · receipt on file.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
