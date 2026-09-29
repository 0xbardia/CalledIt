import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test.invalid/calledit";
const { verifyLogin } = await import("./auth.ts");

test("malformed wallet signatures return a validation error before database access", async () => {
  await assert.rejects(
    verifyLogin({
      address: "0x1111111111111111111111111111111111111111",
      nonce: "test-nonce",
      signature: "0x00",
      origin: "https://calledit.bydx.fun",
    }),
    /SIGNATURE/,
  );
});
