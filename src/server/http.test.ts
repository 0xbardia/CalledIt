import assert from "node:assert/strict";
import test from "node:test";
import { clientKey, readCookie, readJson } from "./http.ts";

test("rate-limit identity trusts the proxy-overwritten real IP", () => {
  const first = new Request("https://calledit.bydx.fun/api/v1/auth/nonce", {
    headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.1, 203.0.113.8" },
  });
  const spoofed = new Request("https://calledit.bydx.fun/api/v1/auth/nonce", {
    headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "192.0.2.99, 203.0.113.8" },
  });
  assert.equal(clientKey(first), "203.0.113.8");
  assert.equal(clientKey(spoofed), clientKey(first));
  assert.equal(
    clientKey(new Request("https://localhost", { headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" } })),
    "198.51.100.4",
  );
});

test("JSON reader handles empty and valid requests", async () => {
  assert.deepEqual(await readJson(new Request("https://localhost")), {});
  assert.deepEqual(
    await readJson(new Request("https://localhost", { method: "POST", body: '{"ok":true}' })),
    { ok: true },
  );
});

test("malformed cookie encoding is treated as an absent cookie", () => {
  const request = new Request("https://calledit.bydx.fun/api/v1/session", {
    headers: { cookie: "calledit_session=%" },
  });
  assert.equal(readCookie(request, "calledit_session"), null);
});

test("JSON reader rejects oversized declared and streamed bodies", async () => {
  const declared = new Request("https://localhost", {
    method: "POST",
    headers: { "content-length": "20001" },
    body: "{}",
  });
  await assert.rejects(readJson(declared), /BODY_TOO_LARGE/);

  const streamed = new Request("https://localhost", {
    method: "POST",
    body: "x".repeat(20_001),
  });
  await assert.rejects(readJson(streamed), /BODY_TOO_LARGE/);
});
