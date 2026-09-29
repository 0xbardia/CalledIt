import { idsToRefresh } from "./query.ts";
import { markSync, rememberTx, upsertLocked, type StoredForecast } from "./store.ts";

export type ChainReader = {
  getCount: () => Promise<number>;
  getForecast: (id: number) => Promise<string>;
};

type LockedPayload = {
  forecast_id: number;
  author: string;
  mode: string;
  original_text: string;
  source_url?: string;
  source_verification: string;
  locked_at?: number;
  deadline?: number;
  deadline_iso: string;
  category?: string;
  subject?: string;
  predicate?: string;
  comparator?: string;
  target_value?: string;
  unit?: string;
  occurrence?: string;
  canonical?: string;
  criteria?: string;
  ambiguity?: string;
  status: string;
  verdict?: string;
  resolved_at?: number;
  evidence?: string;
  content_hash?: string;
  policy_snapshot?: string;
};

export async function indexFromReader(
  reader: ChainReader,
  scope: {
    network: string;
    contract: string;
    chainStatus: "accepted" | "finalized";
    knownCount: number;
    storedMax: number;
    openIds: number[];
  },
): Promise<{ indexed: number }> {
  const count = await reader.getCount();
  const ids = idsToRefresh(count, scope.knownCount, scope.storedMax, scope.openIds);
  let indexed = 0;
  for (const id of ids) {
    const raw = await reader.getForecast(id);
    const parsed = JSON.parse(raw) as LockedPayload;
    if (parsed.forecast_id !== id || (parsed.status !== "OPEN" && parsed.status !== "RESOLVED")) {
      throw new Error(`Malformed forecast ${id}`);
    }
    const row: StoredForecast = {
      network: scope.network,
      contract_address: scope.contract.toLowerCase(),
      forecast_id: id,
      author: String(parsed.author).toLowerCase(),
      mode: parsed.mode,
      original_text: parsed.original_text,
      source_url: parsed.source_url ?? "",
      source_verification: parsed.source_verification,
      locked_at: parsed.locked_at ?? null,
      deadline: parsed.deadline ?? null,
      deadline_iso: parsed.deadline_iso,
      category: parsed.category ?? "",
      subject: parsed.subject ?? "",
      predicate: parsed.predicate ?? "",
      comparator: parsed.comparator ?? "",
      target_value: parsed.target_value ?? "",
      unit: parsed.unit ?? "",
      occurrence: parsed.occurrence ?? "",
      canonical: parsed.canonical ?? "",
      criteria: parsed.criteria ?? "",
      ambiguity: parsed.ambiguity ?? "",
      status: parsed.status,
      verdict: parsed.verdict ?? "",
      resolved_at: parsed.resolved_at ? parsed.resolved_at : null,
      evidence: parsed.evidence ?? "",
      content_hash: parsed.content_hash ?? "",
      policy_snapshot: parsed.policy_snapshot ?? "",
      chain_status: scope.chainStatus,
      lock_state: "locked",
      tx_hash: null,
    };
    await upsertLocked(row);
    indexed += 1;
  }
  await markSync(true, count);
  return { indexed };
}

export async function noteTransaction(hash: string, network: string, status: string, forecastId?: number, contract?: string): Promise<void> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error("TX");
  const chainStatus = status === "finalized" ? "finalized" : status === "accepted" ? "accepted" : "pending";
  await rememberTx(hash, network, chainStatus, forecastId, contract);
}