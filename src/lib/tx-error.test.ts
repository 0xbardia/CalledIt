import assert from "node:assert/strict";
import test from "node:test";
import { explainChainError } from "./tx-error.ts";

test("contract codes become sentences", () => {
  assert.match(explainChainError("UserError: DUPLICATE"), /already locked/);
  assert.match(explainChainError("INSUFFICIENT_EVIDENCE"), /stays open/);
  assert.match(explainChainError("EARLY_NEGATIVE"), /deadline/);
});

test("a page the network cannot read stays open", () => {
  assert.match(explainChainError("NondetException WEBPAGE_LOAD_FAILED"), /stays open/);
  assert.match(explainChainError("status UNDETERMINED"), /stays open/);
});
test("a slow consensus is not described as a rejection", () => {
  const message = explainChainError('Timed out waiting for transaction 0xabc to reach status "ACCEPTED"');
  assert.match(message, /not rejected/);
});
