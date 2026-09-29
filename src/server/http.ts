import { createHash, randomBytes } from "node:crypto";
import { loadEnv } from "./env.ts";

const hits = new Map<string, { count: number; reset: number }>();

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export function clientKey(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimit(request: Request, bucket: string, limit: number): Response | null {
  const now = Date.now();
  const key = `${bucket}:${clientKey(request)}`;
  if (hits.size > 400) {
    for (const [stale, value] of hits) {
      if (value.reset < now) hits.delete(stale);
    }
  }
  const current = hits.get(key);
  if (!current || current.reset < now) {
    hits.set(key, { count: 1, reset: now + 60_000 });
    return null;
  }
  current.count += 1;
  if (current.count > limit) return fail(429, "RATE_LIMIT", "Too many requests. Wait a minute and try again.");
  return null;
}

export function applyCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const env = loadEnv();
  if (!env.origins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  const env = loadEnv();
  const secure = env.APP_URL.startsWith("https://") ? "; Secure" : "";
  return `calledit_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export async function readJson(request: Request): Promise<unknown> {
  const maxBytes = 20_000;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  if (length === 0) return {};
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}
