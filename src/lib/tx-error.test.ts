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

test("a library string is never shown to the reader", () => {
  // Regression: "Transaction could not be found. Version: viem@2.56.9" was
  // rendered on the form. It names a package, not a cause.
  const message = explainChainError("Transaction could not be found. Version: viem@2.56.9");
  assert.doesNotMatch(message, /viem@/);
  assert.doesNotMatch(message, /Version:/);
  assert.match(message, /Nothing was locked/);
});

test("a declined wallet is reported as a decline, not a failure", () => {
  const message = explainChainError("User rejected the request.");
  assert.match(message, /declined/);
  assert.match(message, /nothing was sent/i);
});

test("a dropped connection is explained", () => {
  assert.match(explainChainError("HttpRequestError: fetch failed"), /connection/i);
  assert.match(explainChainError("ChainDisconnectedError"), /connection/i);
});

test("a wrong network is named as the cause", () => {
  const message = explainChainError("ChainMismatch: chain 1 does not match 61999");
  assert.match(message, /wrong network/i);
  assert.match(message, /nothing was locked/i);
});

test("an unreadable internal failure still says nothing was locked", () => {
  const message = explainChainError("TypeError: Cannot read properties of undefined (reading 'x')");
  assert.doesNotMatch(message, /TypeError|Cannot read properties/);
  assert.match(message, /Nothing was locked/);
});
