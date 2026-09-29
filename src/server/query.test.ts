import assert from "node:assert/strict";
import test from "node:test";
import { idsToRefresh, mergeChainStatus, nextCursor, parseForecastListQuery } from "./query.ts";

test("list query accepts the public filters and rejects garbage", () => {
  const contract = "0x1111111111111111111111111111111111111111";
  const ok = parseForecastListQuery(new URLSearchParams(`status=OPEN&drafts=1&limit=10&cursor=40:${contract}`));
  assert.deepEqual(ok, { status: "OPEN", limit: 10, cursor: { id: 40, contract }, includeDrafts: true });

  const defaults = parseForecastListQuery(new URLSearchParams());
  assert.deepEqual(defaults, { status: null, limit: 20, cursor: undefined, includeDrafts: false });

  assert.deepEqual(parseForecastListQuery(new URLSearchParams("status=MAYBE")), { error: "STATUS" });
  assert.deepEqual(parseForecastListQuery(new URLSearchParams("limit=0")), { error: "LIMIT" });
  assert.deepEqual(parseForecastListQuery(new URLSearchParams("cursor=nope")), { error: "CURSOR" });
  assert.deepEqual(parseForecastListQuery(new URLSearchParams("cursor=40")), { error: "CURSOR" });
});

test("cursor identifies the last contract row only when the page is full", () => {
  const rows = [9, 8, 7].map((forecast_id) => ({
    forecast_id,
    contract_address: "0x1111111111111111111111111111111111111111",
  }));
  assert.equal(nextCursor(rows, 3), "7:0x1111111111111111111111111111111111111111");
  assert.equal(nextCursor(rows.slice(0, 2), 3), null);
  assert.equal(nextCursor([], 3), null);
});

test("the index rereads only new locks and forecasts that are still open", () => {
  assert.deepEqual(idsToRefresh(1, 1, 1, []), []);
  assert.deepEqual(idsToRefresh(3, 1, 1, []), [2, 3]);
  assert.deepEqual(idsToRefresh(3, 3, 3, [1, 2]), [1, 2]);
  assert.deepEqual(idsToRefresh(1, 0, 0, []), [1]);
  assert.deepEqual(idsToRefresh(3, 3, 1, []), [2, 3]);
  assert.deepEqual(idsToRefresh(1, 5, 0, []), [1]);
});
test("transaction status never moves backward", () => {
  assert.equal(mergeChainStatus("pending", "accepted"), "accepted");
  assert.equal(mergeChainStatus("accepted", "pending"), "accepted");
  assert.equal(mergeChainStatus("finalized", "accepted"), "finalized");
  assert.equal(mergeChainStatus("pending", "pending"), "pending");
});
