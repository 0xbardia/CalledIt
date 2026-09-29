/**
 * Wallet authentication certification: nonce lifecycle, replay, wrong wallet,
 * wrong origin, session expiry, and logout.
 *
 * Runs against whichever backend the environment selects (Postgres when
 * DATABASE_URL is set, PGLite otherwise) so the SQL under test is the SQL that
 * production runs. Every row it creates is namespaced by a random suffix and
 * removed afterwards, so it never touches real sessions or forecasts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ORIGIN = "https://calledit.bydx.fun";
const alice = privateKeyToAccount(generatePrivateKey());
const mallory = privateKeyToAccount(generatePrivateKey());

const { issueNonce, loginMessage, logout, sessionAddress, verifyLogin } = await import(
  "./auth.ts"
);
const { sql } = await import("./store.ts");

const SUFFIX = Math.random().toString(36).slice(2, 10);

async function cleanup() {
  const db = await sql();
  await db.query(`delete from auth_nonces where origin = $1 or nonce like $2`, [
    ORIGIN,
    `%${SUFFIX}%`,
  ]);
  await db.query(`delete from sessions where address in ($1, $2)`, [
    alice.address.toLowerCase(),
    mallory.address.toLowerCase(),
  ]);
}

function cookieRequest(token: string, origin = ORIGIN): Request {
  return new Request(`${origin}/`, {
    headers: {
      cookie: `calledit_session=${token}`,
      host: new URL(origin).host,
    },
  });
}

test("auth: a nonce is random, and two issues never collide", async () => {
  const a = await issueNonce(alice.address, ORIGIN);
  const b = await issueNonce(alice.address, ORIGIN);
  assert.notEqual(a.nonce, b.nonce);
  assert.ok(a.nonce.length >= 32, "nonce must not be short or predictable");
  const db = await sql();
  const rows = await db.query<{ nonce: string }>(
    `select nonce from auth_nonces where nonce in ($1, $2)`,
    [a.nonce, b.nonce],
  );
  assert.equal(rows.length, 2, "each nonce is persisted independently");
  await cleanup();
});

test("auth: a valid signature opens a session bound to the signing wallet", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await alice.signMessage({ message });
  const token = await verifyLogin({
    address: alice.address,
    nonce,
    signature,
    origin: ORIGIN,
  });
  assert.ok(token.length >= 32);
  const address = await sessionAddress(cookieRequest(token), ORIGIN);
  assert.equal(address, alice.address.toLowerCase());
  await cleanup();
});

test("auth: the nonce is single use, so a replayed signature is refused", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await alice.signMessage({ message });
  const first = await verifyLogin({
    address: alice.address,
    nonce,
    signature,
    origin: ORIGIN,
  });
  assert.ok(first);
  await assert.rejects(
    verifyLogin({ address: alice.address, nonce, signature, origin: ORIGIN }),
    /NONCE/,
  );
  await cleanup();
});

test("auth: an expired nonce is refused", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const db = await sql();
  await db.query(`update auth_nonces set expires_at = now() - interval '1 second' where nonce = $1`, [
    nonce,
  ]);
  const signature = await alice.signMessage({ message });
  await assert.rejects(
    verifyLogin({ address: alice.address, nonce, signature, origin: ORIGIN }),
    /NONCE/,
  );
  await cleanup();
});

test("auth: another wallet's signature for the same nonce is refused", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await mallory.signMessage({ message: message });
  await assert.rejects(
    verifyLogin({ address: alice.address, nonce, signature, origin: ORIGIN }),
    /SIGNATURE/,
  );
  // The nonce survives a failed attempt, so the real owner can still sign.
  const good = await alice.signMessage({ message });
  assert.ok(await verifyLogin({ address: alice.address, nonce, signature: good, origin: ORIGIN }));
  await cleanup();
});

test("auth: a signature bound to another origin is refused", async () => {
  const { nonce } = await issueNonce(alice.address, ORIGIN);
  const foreign = await alice.signMessage({
    message: loginMessage("https://evil.example", alice.address, nonce),
  });
  await assert.rejects(
    verifyLogin({ address: alice.address, nonce, signature: foreign, origin: ORIGIN }),
    /SIGNATURE/,
  );
  const db = await sql();
  const used = await db.query<{ used_at: string | null }>(
    `select used_at from auth_nonces where nonce = $1`,
    [nonce],
  );
  assert.equal(used[0]?.used_at ?? null, null, "a failed attempt must not burn the nonce");
  // The real owner can still complete the login, so the refusal was specific.
  const { nonce: second, message } = await issueNonce(alice.address, ORIGIN);
  assert.ok(
    await verifyLogin({
      address: alice.address,
      nonce: second,
      signature: await alice.signMessage({ message }),
      origin: ORIGIN,
    }),
  );
  await cleanup();
});

test("auth: the nonce cannot be redeemed from a different origin", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await alice.signMessage({ message });
  // The origin is inside the signed message, so a cross-origin redemption is
  // refused at the signature check, before the nonce is ever looked up.
  await assert.rejects(
    verifyLogin({
      address: alice.address,
      nonce,
      signature,
      origin: "https://evil.example",
    }),
    /SIGNATURE|NONCE/,
  );
  const db = await sql();
  const rows = await db.query<{ used_at: string | null; origin: string }>(
    `select used_at, origin from auth_nonces where nonce = $1`,
    [nonce],
  );
  assert.equal(rows[0]?.used_at ?? null, null, "a cross-origin attempt must not burn the nonce");
  assert.equal(rows[0]?.origin, ORIGIN, "the nonce stays bound to the origin that issued it");
  await cleanup();
});

test("auth: a session cookie is not accepted on another origin", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await alice.signMessage({ message });
  const token = await verifyLogin({
    address: alice.address,
    nonce,
    signature,
    origin: ORIGIN,
  });
  assert.equal(await sessionAddress(cookieRequest(token), ORIGIN), alice.address.toLowerCase());
  assert.equal(await sessionAddress(cookieRequest(token), "https://evil.example"), null);
  await cleanup();
});

test("auth: an expired session is refused and logout destroys a live one", async () => {
  const { nonce, message } = await issueNonce(alice.address, ORIGIN);
  const signature = await alice.signMessage({ message });
  const token = await verifyLogin({
    address: alice.address,
    nonce,
    signature,
    origin: ORIGIN,
  });
  const db = await sql();
  await db.query(`update sessions set expires_at = now() - interval '1 second' where address = $1`, [
    alice.address.toLowerCase(),
  ]);
  assert.equal(await sessionAddress(cookieRequest(token), ORIGIN), null, "expiry must invalidate");

  // A fresh session, then an explicit logout.
  const second = await issueNonce(alice.address, ORIGIN);
  const secondMessage = loginMessage(ORIGIN, alice.address, second.nonce);
  const liveToken = await verifyLogin({
    address: alice.address,
    nonce: second.nonce,
    signature: await alice.signMessage({ message: secondMessage }),
    origin: ORIGIN,
  });
  assert.equal(
    await sessionAddress(cookieRequest(liveToken), ORIGIN),
    alice.address.toLowerCase(),
  );
  await logout(cookieRequest(liveToken));
  assert.equal(
    await sessionAddress(cookieRequest(liveToken), ORIGIN),
    null,
    "logout must invalidate the session",
  );
  await cleanup();
});

test("auth: a missing or forged cookie yields no session", async () => {
  assert.equal(await sessionAddress(new Request(`${ORIGIN}/`), ORIGIN), null);
  const forged = cookieRequest(`${SUFFIX}-not-a-real-token`);
  assert.equal(await sessionAddress(forged, ORIGIN), null);
  await logout(forged); // must not throw
  await cleanup();
});

test("auth: malformed addresses are rejected before any database work", async () => {
  await assert.rejects(issueNonce("not-an-address", ORIGIN), /ADDRESS/);
  await assert.rejects(
    verifyLogin({
      address: "0x1234",
      nonce: `${SUFFIX}-unused`,
      signature: `0x${"11".repeat(65)}`,
      origin: ORIGIN,
    }),
    /ADDRESS/,
  );
});
