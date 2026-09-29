export type Forecast = {
  network: string;
  contract_address: string;
  forecast_id: number;
  author: string;
  mode: string;
  original_text: string;
  source_url: string;
  source_verification: string;
  locked_at: number | null;
  deadline: number | null;
  deadline_iso: string;
  category: string;
  subject: string;
  predicate: string;
  comparator: string;
  target_value: string;
  unit: string;
  occurrence: string;
  canonical: string;
  criteria: string;
  ambiguity: string;
  status: string;
  verdict: string;
  resolved_at: number | null;
  evidence: string;
  content_hash?: string;
  policy_snapshot?: string;
  chain_status: string;
  lock_state: string;
  tx_hash: string | null;
};

export type Reputation = {
  total: number;
  open: number;
  resolved: number;
  correct: number;
  incorrect: number;
  drafts: number;
  verifiedImports: number;
  accuracy: number | null;
  categories: Record<string, number>;
};

export type IndexerStatus = { current: boolean; lastSuccessAt: string | null };

export function indexerNotice(status?: IndexerStatus): string {
  return status?.current
    ? "This view reflects the latest completed contract read."
    : "Showing indexed data. The latest chain read is delayed, so newer forecasts may not appear yet.";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("CalledIt could not reach its API. Refresh to try again.");
  }
  const body = (await response.json()) as T & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message || "Request failed");
  return body;
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function when(unix: number | null): string {
  if (!unix) return "Not recorded";
  return new Date(unix * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
