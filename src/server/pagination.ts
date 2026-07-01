import "server-only";

// KAN-70 (BE perf): shared limit/offset pagination for list queries. Keeps
// dashboards fast by never selecting an unbounded number of rows. Callers pass a
// page (1-based) + optional pageSize; services translate that to LIMIT/OFFSET and
// return the slice plus enough metadata to render a pager.

export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type PageParams = { page?: number; pageSize?: number };

export type Paginated<T> = {
  items: T[];
  page: number; // 1-based, normalised
  pageSize: number;
  /** Fetch limit+1 rows to detect a next page without a COUNT query. */
  hasMore: boolean;
};

export type NormalizedPage = { limit: number; offset: number; page: number; pageSize: number };

/** Clamp/normalise raw params into safe LIMIT/OFFSET values. */
export function normalizePage(params: PageParams = {}): NormalizedPage {
  const pageSize = clampInt(params.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const page = clampInt(params.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

/**
 * Build a `Paginated<T>` from rows fetched with `limit = pageSize + 1`.
 * The extra row (if present) signals `hasMore` and is trimmed off the result.
 */
export function buildPage<T>(rows: T[], np: NormalizedPage): Paginated<T> {
  const hasMore = rows.length > np.pageSize;
  return {
    items: hasMore ? rows.slice(0, np.pageSize) : rows,
    page: np.page,
    pageSize: np.pageSize,
    hasMore,
  };
}

function clampInt(n: number, min: number, max: number): number {
  const i = Math.floor(Number.isFinite(n) ? n : min);
  return Math.min(max, Math.max(min, i));
}
