/**
 * Indexer certification: cursor integrity, duplicate tolerance, restart
 * safety, and RPC failure handling.
 *
 * The chain reader is a local stub, so every case is deterministic. The
 * database work is real, against whichever backend the environment selects, so
 * the SQL under test is the SQL production runs. Rows are namespaced by a
 * random suffix and removed afterwards.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

const NETWORK = "certification-indexer";
const SUFFIX = randomBytes(6).toString("hex");
const CONTRACT = `0x${randomBytes(20).toString("hex")}`;

import type { ChainReader } from "./indexer.ts";

const { indexFromReader, noteTransaction } = await import("./indexer.ts");
const { listForecasts, markSync, sql, syncState } = await import("./store.ts");
const { idsToRefresh, mergeChainStatus } = await import("./query.ts");

type Row = {
  forecast_id: number;
  status: string;
  verdict: string;
  original_text: string;
};

function payload(id: number, over: Partial<Row> = {}): Row {
  return {
    forecast_id: id,
    status: "OPEN",
    verdict: "",
    original_text: `Certification forecast ${id} for ${SUFFIX}`,
    ...over,
  };
}

function reader(rows: Map<number, Row>, count: number): ChainReader {
  return {
    getCount: async () => count,
    getForecast: async (id: number) => {
      const row = rows.get(id);
      if (!row) throw new Error(`execution failed: forecast ${id} missing`);
      return JSON.stringify({
        author: "0x0000000000000000000000000000000000000001",
        mode: "NATIVE",
        source_url: "",
        source_verification: "NOT_APPLICABLE",
        locked_at: 1_700_000_000,
        deadline: 1_800_000_000,
        deadline_iso: "2027-12-31",
        category: "PRICE_THRESHOLD",
        subject: "BTC",
        predicate: "price above threshold",
        comparator: ">",
        target_value: "150000",
        unit: "USD",
        occurrence: "THRESHOLD",
        canonical: "BTC price > 150000 USD before 2027-12-31.",
        criteria: "CORRECT if BTC trades above 150000 USD.",
        ambiguity: "CLEAR",
        content_hash: `hash-${id}-${SUFFIX}`,
        policy_snapshot: "reuters.com",
        ...row,
      });
    },
  };
}

async function scope() {
  return {
    network: NETWORK,
    contract: CONTRACT,
    chainStatus: "accepted" as const,
    knownCount: 0,
    storedMax: 0,
    openIds: [] as number[],
  };
}

async function storedCount(): Promise<number> {
  const db = await sql();
  const rows = await db.query<{ n: number }>(
    `select count(*)::int as n from forecasts where network = $1 and contract_address = $2`,
    [NETWORK, CONTRACT.toLowerCase()],
  );
  return rows[0]?.n ?? 0;
}

async function reset() {
  const db = await sql();
  await db.query(`delete from forecasts where network = $1`, [NETWORK]);
  await db.query(`delete from indexed_transactions where network = $1`, [NETWORK]);
}

test("indexer: a normal catch-up indexes each new id once", async () => {
  await reset();
  const rows = new Map([[1, payload(1)], [2, payload(2)]]);
  const result = await indexFromReader(reader(rows, 2), await scope());
  assert.equal(result.indexed, 2);
  assert.equal(await storedCount(), 2);
  const state = await syncState();
  assert.equal(state.last_forecast_count, 2, "cursor advances to the observed count");
  assert.equal(state.last_error, false);
  await reset();
});

test("indexer: a duplicate event does not duplicate a forecast", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  const first = await indexFromReader(reader(rows, 1), await scope());
  const second = await indexFromReader(reader(rows, 1), { ...(await scope()), knownCount: 1, storedMax: 1 });
  assert.equal(first.indexed, 1);
  assert.equal(second.indexed, 0, "a known id is not re-read");
  assert.equal(await storedCount(), 1, "re-indexing must not create a second row");
  await reset();
});

test("indexer: an open forecast is refreshed after a restart, and stays one row", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  await indexFromReader(reader(rows, 1), await scope());
  // A restart loses in-memory state; only `knownCount` survives in the database.
  const afterRestart = await indexFromReader(reader(rows, 1), {
    ...(await scope()),
    knownCount: 1,
    openIds: [1],
  });
  assert.equal(afterRestart.indexed, 1, "an open id is re-read after a restart");
  assert.equal(await storedCount(), 1, "the same event must not duplicate the forecast");
  await reset();
});

test("indexer: a resolved row is write-once and is not re-read", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  await indexFromReader(reader(rows, 1), await scope());
  rows.set(1, payload(1, { status: "RESOLVED", verdict: "CORRECT" }));
  const refreshed = await indexFromReader(reader(rows, 1), { ...(await scope()), openIds: [1] });
  assert.equal(refreshed.indexed, 1);
  const listed = await listForecasts({
    status: "RESOLVED",
    limit: 10,
    includeDrafts: false,
    network: NETWORK,
    contracts: [CONTRACT.toLowerCase()],
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].verdict, "CORRECT");
  // Without the open id the resolved row is left alone.
  const settled = await indexFromReader(reader(rows, 1), {
    ...(await scope()),
    knownCount: 1,
    storedMax: 1,
  });
  assert.equal(settled.indexed, 0);
  assert.equal(await storedCount(), 1);
  await reset();
});

test("indexer: a chain-status regression cannot demote a finalized row", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  await indexFromReader(reader(rows, 1), {
    ...(await scope()),
    chainStatus: "finalized",
  });
  await indexFromReader(reader(rows, 1), {
    ...(await scope()),
    chainStatus: "accepted",
    knownCount: 1,
    openIds: [1],
  });
  const listed = await listForecasts({
    status: "OPEN",
    limit: 10,
    includeDrafts: false,
    network: NETWORK,
    contracts: [CONTRACT.toLowerCase()],
  });
  assert.equal(listed[0].chain_status, "finalized");
  assert.equal(mergeChainStatus("finalized", "pending"), "finalized");
  assert.equal(mergeChainStatus("accepted", "pending"), "accepted");
  assert.equal(mergeChainStatus("pending", "accepted"), "accepted");
  await reset();
});

for (const [name, failure] of [
  ["RPC timeout", new Error("request timed out")],
  ["RPC rate limit", new Error("GenLayer RPC error (gen_call): Rate limit exceeded: 5000 requests per day")],
  ["malformed response", new Error("Malformed forecast 1")],
  ["wrong network", new Error("CalledIt GenLayer network and chain id do not match.")],
  ["wrong contract address", new Error("execution failed")],
] as const) {
  test(`indexer: ${name} leaves the cursor and the data untouched`, async () => {
    await reset();
    const before = await syncState();
    await assert.rejects(
      indexFromReader(
        {
          getCount: async () => {
            throw failure;
          },
          getForecast: async () => {
            throw failure;
          },
        },
        await scope(),
      ),
      /./,
    );
    await markSync(false, 0, failure.message);
    const after = await syncState();
    assert.equal(
      after.last_forecast_count,
      before.last_forecast_count,
      "a failed sync must not advance or reset the cursor",
    );
    assert.equal(after.last_error, true, "the failure must be visible");
    assert.ok(after.last_error_at, "the failure must be timestamped");
    assert.equal(await storedCount(), 0, "a failed sync must not write partial data");
    await reset();
  });
}

test("indexer: a partial read does not move the cursor and recovery completes", async () => {
  await reset();
  const before = await syncState();
  const rows = new Map([[1, payload(1)], [2, payload(2, { status: "GARBAGE" as never })]]);
  await assert.rejects(indexFromReader(reader(rows, 2), await scope()), /Malformed forecast 2/);
  // Ids are upserted one at a time, so the valid id may already be stored. What
  // must never happen is a cursor that claims progress over unread ids.
  const mid = await syncState();
  assert.equal(mid.last_forecast_count, before.last_forecast_count, "the cursor must not advance");
  assert.equal(await storedCount(), 1, "the unreadable id is not stored");

  // Recovery: the chain serves a valid payload and the next pass indexes it.
  rows.set(2, payload(2));
  const recovered = await indexFromReader(reader(rows, 2), { ...(await scope()), knownCount: 1, storedMax: 1 });
  assert.equal(recovered.indexed, 1);
  const state = await syncState();
  assert.equal(state.last_forecast_count, 2);
  assert.equal(state.last_error, false, "a successful pass clears the error flag");
  assert.equal(await storedCount(), 2, "recovery completes without duplicating id 1");
  await reset();
});

test("indexer: an id gap is not skipped and out-of-range reads are refused", async () => {
  await reset();
  const rows = new Map([[1, payload(1)], [2, payload(2)]]);
  // The chain reports 3 but cannot serve id 3 yet: the pass must fail loudly.
  const before = await syncState();
  await assert.rejects(indexFromReader(reader(rows, 3), await scope()), /missing/);
  const state = await syncState();
  assert.notEqual(state.last_forecast_count, 3, "the cursor must not jump over a gap");
  assert.equal(state.last_forecast_count, before.last_forecast_count, "the cursor must not move at all");
  assert.equal(idsToRefresh(3, 0, 0, []).join(","), "1,2,3");
  assert.equal(idsToRefresh(3, 0, 1, []).join(","), "1,2,3", "a cursor behind the data is replayed");
  assert.equal(idsToRefresh(3, 3, 1, []).join(","), "2,3", "a known count skips what is stored");
  assert.equal(
    idsToRefresh(3, 0, 9, []).join(","),
    "1,2,3",
    "a stored max ahead of the known count is not trusted, so the pass is replayed",
  );
  assert.equal(idsToRefresh(3, 3, 3, [2]).join(","), "2", "an open id is always re-read");
  assert.equal(idsToRefresh(0, 0, 0, [5]).join(","), "", "an id beyond the count is ignored");
  await reset();
});

test("indexer: transaction notes are idempotent and status never regresses", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  await indexFromReader(reader(rows, 1), await scope());
  const hash = `0x${"ab".repeat(32)}`;
  await noteTransaction(hash, NETWORK, "finalized", 1, CONTRACT);
  await noteTransaction(hash, NETWORK, "accepted", 1, CONTRACT);
  await noteTransaction(hash, NETWORK, "finalized", 1, CONTRACT);
  const db = await sql();
  const txs = await db.query<{ chain_status: string }>(
    `select chain_status from indexed_transactions where tx_hash = $1`,
    [hash],
  );
  assert.equal(txs.length, 1, "the same hash is stored once");
  assert.equal(txs[0].chain_status, "finalized");
  const listed = await listForecasts({
    status: "OPEN",
    limit: 10,
    includeDrafts: false,
    network: NETWORK,
    contracts: [CONTRACT.toLowerCase()],
  });
  assert.equal(listed[0].tx_hash, hash, "the receipt is attached to its forecast");
  assert.equal(listed[0].chain_status, "finalized");
  await assert.rejects(noteTransaction("not-a-hash", NETWORK, "finalized"), /TX/);
  await reset();
});

test("indexer: a transaction for another contract is not attached to this forecast", async () => {
  await reset();
  const rows = new Map([[1, payload(1)]]);
  await indexFromReader(reader(rows, 1), await scope());
  const hash = `0x${"cd".repeat(32)}`;
  const other = `0x${"ef".repeat(20)}`;
  await noteTransaction(hash, NETWORK, "finalized", 1, other);
  const listed = await listForecasts({
    status: "OPEN",
    limit: 10,
    includeDrafts: false,
    network: NETWORK,
    contracts: [CONTRACT.toLowerCase()],
  });
  assert.equal(listed[0].tx_hash, null, "a foreign contract must not claim this forecast");
  await reset();
});

test.after(async () => {
  await reset();
});
