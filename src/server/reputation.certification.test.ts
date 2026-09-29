/**
 * Reputation math certification.
 *
 * Every expected number below is computed by hand from the fixture and written
 * out literally, so a change in the formula cannot silently move a total.
 *
 * Protocol rules being certified:
 *   - an OPEN forecast is neither correct nor incorrect;
 *   - accuracy is complete-history accuracy over scored verdicts only;
 *   - a losing forecast stays represented (INCORRECT is never dropped);
 *   - simulator drafts never enter reputation;
 *   - the chain is the source of truth, so a mirror row is what the contract says.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ForecastRow } from "./reputation.ts";

const { reputationFrom } = await import("./reputation.ts");

function row(over: Partial<ForecastRow> & { verdict: string }): ForecastRow {
  return {
    status: "RESOLVED",
    mode: "NATIVE",
    source_verification: "NOT_APPLICABLE",
    category: "PRICE_THRESHOLD",
    locked_at: 1_700_000_000,
    deadline: 1_800_000_000,
    chain_status: "finalized",
    lock_state: "locked",
    ...over,
  };
}

test("reputation: an empty history reports no accuracy rather than zero", () => {
  const rep = reputationFrom([]);
  assert.equal(rep.total, 0);
  assert.equal(rep.open, 0);
  assert.equal(rep.resolved, 0);
  assert.equal(rep.correct, 0);
  assert.equal(rep.incorrect, 0);
  assert.equal(rep.accuracy, null, "0/0 must not be presented as 0% or 100%");
  assert.deepEqual(rep.categories, {});
});

test("reputation: only open forecasts", () => {
  const rows = [
    row({ status: "OPEN", verdict: "" }),
    row({ status: "OPEN", verdict: "", category: "EVENT_OCCURRENCE" }),
    row({ status: "OPEN", verdict: "", category: "EVENT_OCCURRENCE" }),
  ];
  const rep = reputationFrom(rows);
  assert.equal(rep.total, 3);
  assert.equal(rep.open, 3);
  assert.equal(rep.resolved, 0);
  assert.equal(rep.correct, 0);
  assert.equal(rep.incorrect, 0);
  assert.equal(rep.accuracy, null, "open calls are not misses and are not wins");
  assert.deepEqual(rep.categories, { PRICE_THRESHOLD: 1, EVENT_OCCURRENCE: 2 });
});

test("reputation: hand-computed mixed history", () => {
  // 8 locked forecasts:
  //   3 CORRECT   (2 price, 1 event)
  //   2 INCORRECT (1 price, 1 event)
  //   2 OPEN      (1 price, 1 event)
  //   1 RESOLVED with verdict UNRESOLVED -> neither correct nor incorrect
  const rows = [
    row({ verdict: "CORRECT" }),
    row({ verdict: "CORRECT" }),
    row({ verdict: "CORRECT", category: "EVENT_OCCURRENCE" }),
    row({ verdict: "INCORRECT" }),
    row({ verdict: "INCORRECT", category: "EVENT_OCCURRENCE" }),
    row({ status: "OPEN", verdict: "" }),
    row({ status: "OPEN", verdict: "", category: "EVENT_OCCURRENCE" }),
    row({ status: "RESOLVED", verdict: "UNRESOLVED" }),
  ];
  const rep = reputationFrom(rows);
  assert.equal(rep.total, 8);
  assert.equal(rep.correct, 3);
  assert.equal(rep.incorrect, 2);
  assert.equal(rep.open, 2);
  assert.equal(rep.resolved, 6, "RESOLVED rows, including the unresolved verdict");
  assert.equal(rep.accuracy, 3 / 5, "3 correct out of 5 scored verdicts");
  assert.deepEqual(rep.categories, { PRICE_THRESHOLD: 5, EVENT_OCCURRENCE: 3 });
  assert.equal(rep.open, 2);
  assert.equal(rep.correct + rep.incorrect, 5);
  assert.equal(rep.open + rep.resolved, rep.total, "every locked forecast is one of open/resolved");
  // Differential proof that open is not a miss: removing the open rows must not
  // change the incorrect count, and adding one must not change it either.
  const withoutOpen = reputationFrom(rows.filter((r) => r.status !== "OPEN"));
  const withExtraOpen = reputationFrom([...rows, row({ status: "OPEN", verdict: "" })]);
  assert.equal(withoutOpen.incorrect, rep.incorrect, "open rows never become misses");
  assert.equal(withExtraOpen.incorrect, rep.incorrect, "an extra open row is not a miss");
  assert.equal(withExtraOpen.total, rep.total + 1);
  assert.equal(withExtraOpen.accuracy, rep.accuracy, "accuracy ignores open rows entirely");
});

test("reputation: all losses stay represented and accuracy reaches zero", () => {
  const rep = reputationFrom([row({ verdict: "INCORRECT" }), row({ verdict: "INCORRECT" })]);
  assert.equal(rep.total, 2);
  assert.equal(rep.incorrect, 2);
  assert.equal(rep.correct, 0);
  assert.equal(rep.accuracy, 0, "a losing history is 0, not null");
});

test("reputation: all wins reach exactly one", () => {
  const rep = reputationFrom([row({ verdict: "CORRECT" }), row({ verdict: "CORRECT" })]);
  assert.equal(rep.accuracy, 1);
});

test("reputation: drafts and simulated rows are excluded from reputation", () => {
  const rows = [
    row({ verdict: "CORRECT" }),
    row({ verdict: "INCORRECT", lock_state: "draft" }),
    row({ verdict: "CORRECT", chain_status: "simulated" }),
    row({ status: "OPEN", verdict: "", lock_state: "draft" }),
  ];
  const rep = reputationFrom(rows);
  assert.equal(rep.total, 1, "only locked, non-simulated rows are scored");
  assert.equal(rep.correct, 1);
  assert.equal(rep.incorrect, 0);
  assert.equal(rep.accuracy, 1);
  assert.equal(rep.drafts, 2, "drafts are counted separately, not as forecasts");
});

test("reputation: verified imports are counted without changing the score", () => {
  const rep = reputationFrom([
    row({ verdict: "CORRECT", mode: "IMPORTED", source_verification: "VERIFIED" }),
    row({ verdict: "CORRECT" }),
  ]);
  assert.equal(rep.verifiedImports, 1);
  assert.equal(rep.total, 2);
  assert.equal(rep.accuracy, 1);
});

test("reputation: a duplicated chain read cannot inflate a total", async () => {
  // The mirror is keyed by (network, contract, forecast_id), so re-reading the
  // same chain id is an upsert. This asserts the uniqueness that makes the
  // total a function of distinct forecasts.
  const { sql, listForecasts } = await import("./store.ts");
  const { randomBytes } = await import("node:crypto");
  const network = "certification-reputation";
  const contract = `0x${randomBytes(20).toString("hex")}`;
  const db = await sql();
  await db.query(`delete from forecasts where network = $1`, [network]);
  const insert = async (id: number, verdict: string) => {
    await db.query(
      `insert into forecasts (network, contract_address, forecast_id, author, mode, original_text,
        source_verification, deadline_iso, status, verdict, category, chain_status, lock_state)
       values ($1,$2,$3,$4,'NATIVE',$5,'NOT_APPLICABLE','2027-12-31','RESOLVED',$6,'PRICE_THRESHOLD','finalized','locked')
       on conflict (network, contract_address, forecast_id) do update set verdict = excluded.verdict`,
      [network, contract, id, "0x0000000000000000000000000000000000000001", `dup ${id}`, verdict],
    );
  };
  // Two identical passes: the same two chain ids, read twice.
  for (const _pass of [1, 2]) {
    await insert(1, "CORRECT");
    await insert(2, "INCORRECT");
  }
  const rows = await listForecasts({
    status: "ALL",
    limit: 10,
    includeDrafts: false,
    network,
    contracts: [contract],
  });
  const rep = reputationFrom(rows);
  assert.equal(rows.length, 2, "a repeated read does not create a second row");
  assert.equal(rep.total, 2);
  assert.equal(rep.correct, 1);
  assert.equal(rep.incorrect, 1);
  assert.equal(rep.accuracy, 0.5);
  await db.query(`delete from forecasts where network = $1`, [network]);
});

test("reputation: an ambiguous verdict is neither correct nor incorrect", () => {
  const rep = reputationFrom([
    row({ verdict: "AMBIGUOUS" }),
    row({ verdict: "CORRECT" }),
    row({ verdict: "INCORRECT" }),
  ]);
  assert.equal(rep.total, 3);
  assert.equal(rep.resolved, 3);
  assert.equal(rep.correct, 1);
  assert.equal(rep.incorrect, 1);
  assert.equal(rep.accuracy, 0.5, "ambiguity is excluded from the denominator");
});

test("reputation: an unknown category is skipped instead of inventing a bucket", () => {
  const rep = reputationFrom([row({ verdict: "CORRECT", category: "" })]);
  assert.deepEqual(rep.categories, {});
  assert.equal(rep.total, 1, "the forecast still counts toward the total");
  assert.equal(rep.accuracy, 1);
});

test("reputation: a frontend status filter cannot change the underlying numbers", () => {
  const rows = [
    row({ verdict: "CORRECT" }),
    row({ verdict: "INCORRECT" }),
    row({ status: "OPEN", verdict: "" }),
  ];
  const all = reputationFrom(rows);
  const openOnly = reputationFrom(rows.filter((r) => r.status === "OPEN"));
  const resolvedOnly = reputationFrom(rows.filter((r) => r.status === "RESOLVED"));
  assert.equal(all.total, 3);
  assert.equal(openOnly.total, 1);
  assert.equal(resolvedOnly.total, 2);
  // Accuracy is identical whether or not open rows are in the slice, because
  // open rows never enter the denominator. This is what stops a UI filter from
  // quietly inflating a score.
  assert.equal(all.accuracy, 0.5);
  assert.equal(resolvedOnly.accuracy, 0.5);
  assert.equal(openOnly.accuracy, null);
});
