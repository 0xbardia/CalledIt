import { verifyMessage } from "viem";
import { hashToken, newToken, readCookie } from "./http.ts";
import { sql } from "./store.ts";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function loginMessage(origin: string, address: string, nonce: string): string {
  return [
    "CalledIt wants you to sign in.",
    "",
    `Domain: ${origin}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    "",
    "This signature only opens a CalledIt session. It does not lock a forecast or spend funds.",
  ].join("\n");
}

export async function issueNonce(address: string, origin: string): Promise<{ nonce: string; message: string }> {
  if (!ADDRESS.test(address)) throw new Error("ADDRESS");
  const nonce = newToken();
  const db = await sql();
  await db.query(
    `insert into auth_nonces (nonce, address, origin, expires_at) values ($1, $2, $3, now() + interval '10 minutes')`,
    [nonce, address.toLowerCase(), origin],
  );
  return { nonce, message: loginMessage(origin, address, nonce) };
}

export async function verifyLogin(input: {
  address: string;
  nonce: string;
  signature: `0x${string}`;
  origin: string;
}): Promise<string> {
  if (!ADDRESS.test(input.address)) throw new Error("ADDRESS");
  const message = loginMessage(input.origin, input.address, input.nonce);
  let valid = false;
  try {
    valid = await verifyMessage({ address: input.address as `0x${string}`, message, signature: input.signature });
  } catch {
    throw new Error("SIGNATURE");
  }
  if (!valid) throw new Error("SIGNATURE");
  const db = await sql();
  const consumed = await db.query<{ nonce: string }>(
    `update auth_nonces set used_at = now()
     where nonce = $1 and lower(address) = $2 and origin = $3 and used_at is null and expires_at > now()
     returning nonce`,
    [input.nonce, input.address.toLowerCase(), input.origin],
  );
  if (!consumed[0]) throw new Error("NONCE");
  const token = newToken();
  await db.query(
    `insert into sessions (token_hash, address, origin, expires_at) values ($1, $2, $3, now() + interval '7 days')`,
    [hashToken(token), input.address.toLowerCase(), input.origin],
  );
  return token;
}

export async function sessionAddress(request: Request, origin: string): Promise<string | null> {
  const token = readCookie(request, "calledit_session");
  if (!token) return null;
  const db = await sql();
  const rows = await db.query<{ address: string }>(
    `select address from sessions where token_hash = $1 and expires_at > now() and origin = $2`,
    [hashToken(token), origin],
  );
  return rows[0]?.address ?? null;
}

export async function logout(request: Request): Promise<void> {
  const token = readCookie(request, "calledit_session");
  if (!token) return;
  const db = await sql();
  await db.query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
}
