import assert from "node:assert/strict";
import test from "node:test";
import { reputationFrom } from "./reputation.ts";

test("accuracy ignores open forecasts and drafts", () => {
  const stats = reputationFrom([
    { status: "RESOLVED", verdict: "CORRECT", mode: "NATIVE", source_verification: "NOT_APPLICABLE", category: "PRICE_THRESHOLD", locked_at: 1, deadline: 2, chain_status: "accepted", lock_state: "locked" },
    { status: "RESOLVED", verdict: "INCORRECT", mode: "NATIVE", source_verification: "NOT_APPLICABLE", category: "PRICE_THRESHOLD", locked_at: 1, deadline: 2, chain_status: "finalized", lock_state: "locked" },
    { status: "OPEN", verdict: "", mode: "NATIVE", source_verification: "NOT_APPLICABLE", category: "EVENT_OCCURRENCE", locked_at: 1, deadline: 2, chain_status: "accepted", lock_state: "locked" },
    { status: "OPEN", verdict: "", mode: "NATIVE", source_verification: "NOT_APPLICABLE", category: "", locked_at: null, deadline: null, chain_status: "simulated", lock_state: "draft" },
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.open, 1);
  assert.equal(stats.correct, 1);
  assert.equal(stats.incorrect, 1);
  assert.equal(stats.drafts, 1);
  assert.equal(stats.accuracy, 0.5);
});

test("no scored forecasts means null accuracy", () => {
  const stats = reputationFrom([]);
  assert.equal(stats.accuracy, null);
  assert.equal(stats.total, 0);
});
