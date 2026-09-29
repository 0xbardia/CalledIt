import assert from "node:assert/strict";
import test from "node:test";
import { readableResult } from "./chain.ts";

const accepted = {
  status_name: "ACCEPTED",
  result_name: "MAJORITY_AGREE",
  consensus_data: {
    leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable: "1" } } }],
  },
};

test("returns a value only after majority agreement", () => {
  assert.equal(readableResult(accepted), "1");
  assert.throws(() => readableResult({
    ...accepted,
    status_name: "UNDETERMINED",
    result_name: "MAJORITY_DISAGREE",
  }), /majority agreement/);
});

test("accepted contract reverts remain errors", () => {
  assert.throws(() => readableResult({
    ...accepted,
    consensus_data: {
      leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: "DUPLICATE" } }],
    },
  }), /already locked/);
});
