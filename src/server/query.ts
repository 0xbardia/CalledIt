const STATUSES = new Set(["OPEN", "RESOLVED", "ALL"]);

export type ForecastListQuery = {
  status: string | null;
  limit: number;
  cursor?: { id: number; contract: string };
  includeDrafts: boolean;
};

export type QueryError = { error: "STATUS" | "LIMIT" | "CURSOR" };

export function parseForecastListQuery(params: URLSearchParams): ForecastListQuery | QueryError {
  const rawStatus = params.get("status");
  if (rawStatus && !STATUSES.has(rawStatus)) return { error: "STATUS" };

  const rawLimit = params.get("limit");
  let limit = 20;
  if (rawLimit !== null && rawLimit !== "") {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) return { error: "LIMIT" };
    limit = parsed;
  }

  const rawCursor = params.get("cursor");
  let cursor: { id: number; contract: string } | undefined;
  if (rawCursor !== null && rawCursor !== "") {
    const parsed = rawCursor.match(/^([1-9]\d*):(0x[a-fA-F0-9]{40}|simulator)$/i);
    if (!parsed || !Number.isSafeInteger(Number(parsed[1]))) return { error: "CURSOR" };
    cursor = { id: Number(parsed[1]), contract: parsed[2].toLowerCase() };
  }

  return {
    status: rawStatus === "OPEN" || rawStatus === "RESOLVED" ? rawStatus : null,
    limit,
    cursor,
    includeDrafts: params.get("drafts") === "1",
  };
}

export function nextCursor(rows: Array<{ forecast_id: number; contract_address: string }>, limit: number): string | null {
  if (rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return `${last.forecast_id}:${last.contract_address.toLowerCase()}`;
}

const RANK: Record<string, number> = { pending: 0, accepted: 1, finalized: 2 };

/** Chain status only moves forward. A later pending report cannot erase acceptance. */
export function mergeChainStatus(current: string, incoming: string): string {
  const currentRank = RANK[current] ?? 0;
  const incomingRank = RANK[incoming] ?? 0;
  return incomingRank >= currentRank ? incoming : current;
}

/** New ids, gaps, and still-open forecasts. A resolved row is write-once, so it is not read again. */
export function idsToRefresh(count: number, known: number, storedMax: number, openIds: number[]): number[] {
  const ids = new Set<number>();
  if (count > 0) {
    const start = Math.min(Math.max(0, storedMax), Math.max(0, known)) + 1;
    for (let id = start; id <= count; id += 1) ids.add(id);
  }
  for (const id of openIds) {
    if (id >= 1 && id <= count) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}
