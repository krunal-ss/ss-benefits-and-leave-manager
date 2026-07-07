// KAN-147 — Approval SLA Timer. Pure, dependency-free SLA math shared by the
// server (initial values baked into SSR'd HTML) and the client (the live 1s
// tick in <SlaBadge>, src/components/ui/sla-badge.tsx). No `server-only` here
// on purpose — this module must also be importable from a Client Component.
//
// Math mirrors the design mock's `slaTarget`/`slaRemaining`/`slaView`
// (design/source/Benefit Portal.dc.html, `<script>` class body) exactly:
// target hours = 48 for an expense claim, 24 for a leave/WFH request;
// "soon" starts at <=1h remaining; "overdue" at <=0 remaining.

export const EXPENSE_SLA_HOURS = 48;
export const LEAVE_SLA_HOURS = 24;

export type SlaState = "ok" | "soon" | "overdue";

export type SlaView = {
  state: SlaState;
  label: string;
  remainingMs: number;
  /** 0–100, how much of the SLA window has elapsed so far; clamped to 100 once overdue. */
  pct: number;
};

const HOUR_MS = 3_600_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `${h}h ${mm}m ${ss}s` from a non-negative millisecond duration. */
function clock(absMs: number): string {
  const h = Math.floor(absMs / HOUR_MS);
  const m = Math.floor((absMs % HOUR_MS) / 60_000);
  const s = Math.floor((absMs % 60_000) / 1000);
  return `${h}h ${pad(m)}m ${pad(s)}s`;
}

/**
 * `remainingMs = (createdAt + targetHours) - now`.
 * - `overdue` once `remainingMs <= 0` — label "Overdue by {clock}".
 * - `soon` when `remainingMs <= 1 hour` — label "{clock} left".
 * - otherwise `ok` — label "{clock} left".
 */
export function computeSla(createdAt: Date | string, targetHours: number, now: Date = new Date()): SlaView {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const targetMs = targetHours * HOUR_MS;
  const remainingMs = created.getTime() + targetMs - now.getTime();
  const c = clock(Math.abs(remainingMs));

  if (remainingMs <= 0) {
    return { state: "overdue", label: `Overdue by ${c}`, remainingMs, pct: 100 };
  }
  const pct = Math.round((1 - remainingMs / targetMs) * 100);
  if (remainingMs <= HOUR_MS) {
    return { state: "soon", label: `${c} left`, remainingMs, pct };
  }
  return { state: "ok", label: `${c} left`, remainingMs, pct };
}

/**
 * Bucket a set of pending-row `createdAt` timestamps into on-track/due-soon/
 * overdue counts — the shape consumed by the "Review SLA" / "SLA status"
 * summary bars. A snapshot at call time (not live), same as any other
 * server-computed aggregate — the per-row `<SlaBadge>` is what ticks live.
 */
export function summarizeSla(
  createdAts: (Date | string)[],
  targetHours: number,
  now: Date = new Date(),
): { ok: number; soon: number; over: number } {
  const summary = { ok: 0, soon: 0, over: 0 };
  for (const createdAt of createdAts) {
    const { state } = computeSla(createdAt, targetHours, now);
    if (state === "overdue") summary.over += 1;
    else if (state === "soon") summary.soon += 1;
    else summary.ok += 1;
  }
  return summary;
}
