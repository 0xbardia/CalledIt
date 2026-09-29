import { getSql, type Sql } from "../lib/db.ts";
import { reputationFrom, type ForecastRow, type Reputation } from "./reputation.ts";

export type StoredForecast = ForecastRow & {
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
  content_hash: string;
  policy_snapshot: string;
  chain_status: string;
  lock_state: string;
  tx_hash: string | null;
};

const COLUMNS = `network, contract_address, forecast_id, author, mode, original_text, source_url,
  source_verification, locked_at, deadline, deadline_iso, category, subject, predicate, comparator,
  target_value, unit, occurrence, canonical, criteria, ambiguity, status, verdict, resolved_at,
  evidence, content_hash, policy_snapshot, chain_status, lock_state, tx_hash`;

export type ForecastScope = { network: string; contract: string; contracts?: string[] };

export async function sql(): Promise<Sql> {
  return getSql();
}

export async function listForecasts(opts: {
  status?: string;
  author?: string;
  limit: number;
  cursor?: { id: number; contract: string };
  includeDrafts: boolean;
  network?: string;
  contracts?: string[];
}): Promise<StoredForecast[]> {
  const db = await sql();
  const status = opts.status && opts.status !== "ALL" ? opts.status : null;
  const author = opts.author?.toLowerCase() ?? null;
  const cursorId = opts.cursor?.id ?? null;
  const cursorContract = opts.cursor?.contract ?? null;
  const network = opts.network ?? null;
  const contracts = opts.contracts?.map((contract) => contract.toLowerCase()) ?? null;
  return db.query<StoredForecast>(
    `select ${COLUMNS} from forecasts
     where ($1::text is null or status = $1)
       and ($2::text is null or lower(author) = $2)
       and ($3::integer is null or forecast_id < $3 or (forecast_id = $3 and lower(contract_address) < $4))
       and (
         (lock_state = 'locked' and ($5::text is null or network = $5) and ($6::text[] is null or lower(contract_address) = any($6::text[])))
         or ($7::boolean and network = 'local-draft')
       )
     order by forecast_id desc, lower(contract_address) desc
     limit $8`,
    [status, author, cursorId, cursorContract, network, contracts, opts.includeDrafts, opts.limit],
  );
}

export async function getForecast(id: number, scope?: ForecastScope, contractAddress?: string): Promise<StoredForecast | null> {
  const db = await sql();
  const rows = await db.query<StoredForecast>(
    `select ${COLUMNS} from forecasts
     where forecast_id = $1
       and (network = 'local-draft' or (
         ($2::text is null or network = $2)
         and ($4::text is null or lower(contract_address) = $4)
         and ($5::text[] is null or lower(contract_address) = any($5::text[]))
       ))
     order by case when lower(contract_address) = $3 then 0 else 1 end, lock_state desc
     limit 1`,
    [id, scope?.network ?? null, scope?.contract?.toLowerCase() ?? null, contractAddress?.toLowerCase() ?? null, scope?.contracts ?? null],
  );
  return rows[0] ?? null;
}

export async function indexHints(scope: { network: string; contract: string }): Promise<{ storedMax: number; openIds: number[] }> {
  const db = await sql();
  const contract = scope.contract.toLowerCase();
  const maxRows = await db.query<{ max: number }>(
    `select coalesce(max(forecast_id), 0) as max from forecasts
     where network = $1 and lower(contract_address) = $2 and lock_state = 'locked' and forecast_id < 1000000`,
    [scope.network, contract],
  );
  const openRows = await db.query<{ forecast_id: number }>(
    `select forecast_id from forecasts
     where network = $1 and lower(contract_address) = $2 and lock_state = 'locked' and status = 'OPEN' and forecast_id < 1000000
     order by forecast_id`,
    [scope.network, contract],
  );
  return {
    storedMax: Number(maxRows[0]?.max ?? 0),
    openIds: openRows.map((row) => Number(row.forecast_id)),
  };
}

export async function profileRows(address: string, scope?: ForecastScope): Promise<StoredForecast[]> {
  const db = await sql();
  return db.query<StoredForecast>(
    `select ${COLUMNS} from forecasts
     where lower(author) = $1
       and (
         network = 'local-draft'
         or ($2::text is null or (network = $2 and ($3::text[] is null or lower(contract_address) = any($3::text[]))))
       )
     order by forecast_id desc, lower(contract_address) desc`,
    [address.toLowerCase(), scope?.network ?? null, scope?.contracts?.map((contract) => contract.toLowerCase()) ?? (scope?.contract ? [scope.contract.toLowerCase()] : null)],
  );
}

export async function profileStats(address: string, scope?: ForecastScope): Promise<Reputation> {
  const rows = await profileRows(address, scope);
  return reputationFrom(rows);
}

export async function leaderboard(limit: number, scope?: ForecastScope): Promise<Array<Reputation & { address: string }>> {
  const db = await sql();
  const rows = await db.query<StoredForecast>(
    `select ${COLUMNS} from forecasts
     where lock_state = 'locked' and chain_status <> 'simulated'
       and ($1::text is null or network = $1)
       and ($2::text[] is null or lower(contract_address) = any($2::text[]))`,
    [scope?.network ?? null, scope?.contracts?.map((contract) => contract.toLowerCase()) ?? (scope?.contract ? [scope.contract.toLowerCase()] : null)],
  );
  const byAuthor = new Map<string, StoredForecast[]>();
  for (const row of rows) {
    const key = row.author.toLowerCase();
    const list = byAuthor.get(key) ?? [];
    list.push(row);
    byAuthor.set(key, list);
  }
  return [...byAuthor.entries()]
    .map(([address, authorRows]) => ({ address, ...reputationFrom(authorRows) }))
    .filter((row) => row.resolved > 0 || row.open > 0)
    .sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || b.correct - a.correct || b.total - a.total)
    .slice(0, limit);
}

export async function recentActivity(limit: number, scope?: ForecastScope): Promise<StoredForecast[]> {
  const db = await sql();
  return db.query<StoredForecast>(
    `select ${COLUMNS} from forecasts
     where network = 'local-draft'
        or ($2::text is null or (network = $2 and ($3::text[] is null or lower(contract_address) = any($3::text[]))))
     order by indexed_at desc
     limit $1`,
    [limit, scope?.network ?? null, scope?.contracts?.map((contract) => contract.toLowerCase()) ?? (scope?.contract ? [scope.contract.toLowerCase()] : null)],
  );
}

export async function nextDraftId(): Promise<number> {
  const db = await sql();
  const rows = await db.query<{ max: number }>(
    `select coalesce(max(forecast_id), 1000000) as max from forecasts where network = 'local-draft'`,
  );
  return Math.max(1_000_000, Number(rows[0]?.max ?? 1_000_000)) + 1;
}

export async function insertDraft(row: {
  forecastId: number;
  author: string;
  mode: string;
  originalText: string;
  sourceUrl: string;
  deadlineIso: string;
}): Promise<void> {
  const db = await sql();
  await db.query(
    `insert into forecasts (
      network, contract_address, forecast_id, author, mode, original_text, source_url,
      source_verification, deadline_iso, status, chain_status, lock_state
    ) values ('local-draft', 'simulator', $1, $2, $3, $4, $5, $6, $7, 'OPEN', 'simulated', 'draft')`,
    [
      row.forecastId,
      row.author.toLowerCase(),
      row.mode,
      row.originalText,
      row.sourceUrl,
      row.mode === "IMPORTED" ? "UNVERIFIED" : "NOT_APPLICABLE",
      row.deadlineIso,
    ],
  );
}

export async function upsertLocked(row: StoredForecast): Promise<void> {
  const db = await sql();
  await db.query(
    `insert into forecasts (
      network, contract_address, forecast_id, author, mode, original_text, source_url,
      source_verification, locked_at, deadline, deadline_iso, category, subject, predicate,
      comparator, target_value, unit, occurrence, canonical, criteria, ambiguity, status,
      verdict, resolved_at, evidence, content_hash, policy_snapshot, chain_status, lock_state, tx_hash
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'locked',$29
    )
    on conflict (network, contract_address, forecast_id) do update set
      status = excluded.status,
      verdict = excluded.verdict,
      resolved_at = excluded.resolved_at,
      evidence = excluded.evidence,
      chain_status = case
        when forecasts.chain_status = 'finalized' then 'finalized'
        when excluded.chain_status = 'finalized' then 'finalized'
        when forecasts.chain_status = 'accepted' and excluded.chain_status <> 'finalized' then 'accepted'
        else excluded.chain_status
      end,
      tx_hash = coalesce(excluded.tx_hash, forecasts.tx_hash),
      indexed_at = now()`,
    [
      row.network, row.contract_address, row.forecast_id, row.author, row.mode, row.original_text,
      row.source_url, row.source_verification, row.locked_at, row.deadline, row.deadline_iso,
      row.category, row.subject, row.predicate, row.comparator, row.target_value, row.unit,
      row.occurrence, row.canonical, row.criteria, row.ambiguity, row.status, row.verdict,
      row.resolved_at, row.evidence, row.content_hash, row.policy_snapshot, row.chain_status, row.tx_hash,
    ],
  );
}

export async function markSync(ok: boolean, count: number, error?: string): Promise<void> {
  const db = await sql();
  if (ok) {
    await db.query(
      `update chain_sync_state set last_forecast_count = $1, last_success_at = now(), last_error = null, last_error_at = null where id = 1`,
      [count],
    );
    return;
  }
  await db.query(
    `update chain_sync_state set last_error = $1, last_error_at = now() where id = 1`,
    [error ?? "sync failed"],
  );
}

export async function syncState(): Promise<{ last_forecast_count: number; last_error: boolean; last_success_at: string | null; last_error_at: string | null }> {
  const db = await sql();
  const rows = await db.query<{ last_forecast_count: number; last_error: boolean; last_success_at: string | null; last_error_at: string | null }>(
    `select last_forecast_count, (last_error is not null) as last_error,
      last_success_at::text as last_success_at, last_error_at::text as last_error_at
     from chain_sync_state where id = 1`,
  );
  return rows[0] ?? { last_forecast_count: 0, last_error: false, last_success_at: null, last_error_at: null };
}

export async function rememberTx(hash: string, network: string, status: string, forecastId?: number, contract?: string): Promise<void> {
  const db = await sql();
  await db.query(
    `insert into indexed_transactions (tx_hash, network, chain_status, forecast_id)
     values ($1, $2, $3, $4)
     on conflict (tx_hash) do update set
       chain_status = case
         when indexed_transactions.chain_status = 'finalized' then 'finalized'
         when indexed_transactions.chain_status = 'accepted' and excluded.chain_status <> 'finalized' then 'accepted'
         else excluded.chain_status
       end,
       forecast_id = coalesce(indexed_transactions.forecast_id, excluded.forecast_id),
       seen_at = now()`,
    [hash, network, status, forecastId ?? null],
  );
  if (forecastId && forecastId > 0 && contract) {
    await db.query(
      `update forecasts set
         tx_hash = case when tx_hash is null or tx_hash = '' then $1 else tx_hash end,
         chain_status = case
           when chain_status = 'finalized' then 'finalized'
           when $5 = 'finalized' then 'finalized'
           when chain_status = 'accepted' and $5 <> 'finalized' then 'accepted'
           when $5 = 'accepted' then 'accepted'
           else chain_status
         end
       where forecast_id = $2 and network = $3 and lower(contract_address) = $4
         and (tx_hash is null or tx_hash = '' or lower(tx_hash) = lower($1))`,
      [hash, forecastId, network, contract.toLowerCase(), status],
    );
  }
}
