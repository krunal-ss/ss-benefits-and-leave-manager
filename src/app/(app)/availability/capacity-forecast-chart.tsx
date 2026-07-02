// KAN-79: hand-rolled inline SVG trend chart — no charting library exists in
// this repo (checked package.json) and a 2-4 week line trend doesn't need
// one. Pure presentational Server Component (no state/effects/browser APIs,
// so no "use client"): renders two series over the forecast window —
//   - "Confirmed" (solid, foreground)     = availablePctApproved
//   - "At risk if pending is approved" (dashed, amber) = availablePctWithPending
// A pending request only ever widens the gap between the two lines; it never
// moves the confirmed one (see capacity-forecast-shape.ts / its tests).
// Colors come from CSS variables via `currentColor` + Tailwind text-* utility
// classes, per the design-system skill — never a hard-coded hex.
import type { ForecastPoint } from "@/server/manager/capacity-forecast";

const WIDTH = 720;
const HEIGHT = 168;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

function xAt(i: number, n: number): number {
  return n <= 1 ? PAD_LEFT : PAD_LEFT + (i / (n - 1)) * PLOT_W;
}
function yAt(pct: number): number {
  return PAD_TOP + (1 - pct / 100) * PLOT_H;
}
function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * One or more SVG path `d` strings for a series, broken into a new segment
 * whenever a point has no value (a non-working day) — the line never fakes
 * continuity across a weekend/holiday gap.
 */
function buildPathSegments(points: ForecastPoint[], pctOf: (p: ForecastPoint) => number | null): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    const pct = pctOf(p);
    if (pct === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"} ${xAt(i, points.length).toFixed(1)},${yAt(pct).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

export function CapacityForecastChart({ points }: { points: ForecastPoint[] }) {
  if (points.length === 0) return null;
  const n = points.length;
  const barWidth = n > 1 ? PLOT_W / (n - 1) : PLOT_W;

  const approvedSegments = buildPathSegments(points, (p) => p.availablePctApproved);
  const pendingSegments = buildPathSegments(points, (p) => p.availablePctWithPending);

  // Weekly tick marks (first day, every 7th, and the last) so 21 date labels don't collide.
  const tickIndices = [...new Set([0, ...points.map((_, i) => i).filter((i) => i % 7 === 0), n - 1])].sort((a, b) => a - b);

  const workingApproved = points.filter((p) => p.availablePctApproved !== null);
  const lowestApproved = workingApproved.length
    ? workingApproved.reduce((min, p) => (p.availablePctApproved! < min.availablePctApproved! ? p : min))
    : null;
  const workingPending = points.filter((p) => p.availablePctWithPending !== null);
  const lowestPending = workingPending.length
    ? workingPending.reduce((min, p) => (p.availablePctWithPending! < min.availablePctWithPending! ? p : min))
    : null;
  const pendingDipsFurther = !!(lowestPending && lowestApproved && lowestPending.availablePctWithPending! < lowestApproved.availablePctApproved!);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-0.5 w-4 rounded-full bg-foreground" aria-hidden />
          Confirmed (approved)
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg width="16" height="4" className="text-amber-500" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2.5" />
          </svg>
          At risk if pending is approved
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Team capacity forecast, ${n} days: confirmed (approved) versus at-risk (approved plus pending) availability.`}
      >
        {points.map((p, i) =>
          p.isWorkingDay ? null : (
            <rect
              key={p.date}
              x={xAt(i, n) - barWidth / 2}
              y={PAD_TOP}
              width={barWidth}
              height={PLOT_H}
              className="text-muted-foreground"
              fill="currentColor"
              opacity={0.08}
            />
          ),
        )}

        {[0, 50, 100].map((pct) => (
          <g key={pct} className="text-border">
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yAt(pct)} y2={yAt(pct)} stroke="currentColor" strokeWidth={1} />
            <text x={PAD_LEFT - 5} y={yAt(pct) + 3} textAnchor="end" className="text-muted-foreground text-[9px]" fill="currentColor">
              {pct}%
            </text>
          </g>
        ))}

        <g className="text-amber-500">
          {pendingSegments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
          ))}
        </g>

        <g className="text-foreground">
          {approvedSegments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          ))}
        </g>

        {points.map((p, i) => {
          if (p.availablePctApproved === null) return null;
          const x = xAt(i, n);
          const showPendingDot = p.availablePctWithPending !== null && p.availablePctWithPending !== p.availablePctApproved;
          return (
            <g key={p.date}>
              {showPendingDot && (
                <circle cx={x} cy={yAt(p.availablePctWithPending!)} r={2.5} className="text-amber-500" fill="currentColor">
                  <title>{`${formatShort(p.date)} — at risk: ${p.availablePctWithPending}% available (${p.onLeavePending} pending request${p.onLeavePending === 1 ? "" : "s"})`}</title>
                </circle>
              )}
              <circle cx={x} cy={yAt(p.availablePctApproved)} r={2.5} className="text-foreground" fill="currentColor">
                <title>{`${formatShort(p.date)} — confirmed: ${p.availablePctApproved}% available`}</title>
              </circle>
            </g>
          );
        })}

        {tickIndices.map((i) => (
          <text
            key={i}
            x={xAt(i, n)}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="text-muted-foreground text-[9px]"
            fill="currentColor"
          >
            {formatShort(points[i].date)}
          </text>
        ))}
      </svg>

      {lowestApproved && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            Lowest confirmed: <span className="font-semibold text-foreground">{lowestApproved.availablePctApproved}%</span> on{" "}
            {formatShort(lowestApproved.date)}
          </span>
          {pendingDipsFurther && lowestPending && (
            <span>
              Lowest if pending approved: <span className="font-semibold text-amber-600">{lowestPending.availablePctWithPending}%</span> on{" "}
              {formatShort(lowestPending.date)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
