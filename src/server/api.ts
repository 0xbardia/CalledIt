import { issueNonce, logout, sessionAddress, verifyLogin } from "./auth";
import { loadEnv, publicConfig } from "./env";
import { applyCors, fail, json, rateLimit, readJson, sessionCookie } from "./http";
import { nextCursor, parseForecastListQuery } from "./query";
import { indexFromReader, noteTransaction, type ChainReader } from "./indexer";
import { preflightForecast, IMPORT_HOSTS, RESOLUTION_HOSTS } from "@/lib/preflight";
import {
  getForecast,
  indexHints,
  insertDraft,
  leaderboard,
  listForecasts,
  markSync,
  nextDraftId,
  profileRows,
  profileStats,
  recentActivity,
  syncState,
} from "./store";

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

async function chainReader(): Promise<ChainReader | null> {
  const env = loadEnv();
  if (!env.GENLAYER_CONTRACT_ADDRESS) return null;
  const client = await genlayerReadClient();
  const address = env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`;
  return {
    async getCount() {
      const count = await client.readContract({ address, functionName: "get_forecast_count", args: [] });
      return Number(count);
    },
    async getForecast(id: number) {
      const raw = await client.readContract({ address, functionName: "get_forecast", args: [id] });
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    },
  };
}

async function genlayerReadClient() {
  const env = loadEnv();
  const { createClient } = await import("genlayer-js");
  const chains = await import("genlayer-js/chains");
  const supported = {
    studionet: chains.studionet,
    "testnet-asimov": chains.testnetAsimov,
    "testnet-bradbury": chains.testnetBradbury,
  };
  const chain = supported[env.GENLAYER_NETWORK as keyof typeof supported];
  if (!chain || chain.id !== Number(env.GENLAYER_CHAIN_ID)) {
    throw new Error("CalledIt GenLayer network and chain id do not match.");
  }
  return createClient({ chain, endpoint: env.GENLAYER_RPC_URL });
}

let domainCache: { at: number; importDomains: string[]; resolutionDomains: string[] } | null = null;

function asDomainList(raw: unknown, fallback: string[]): string[] {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string") && parsed.length > 0) return parsed;
  } catch {
    // The contract is canonical. A bad payload keeps the previous list.
  }
  return fallback;
}

/** Import and resolution hosts, refreshed at most once a minute. The form must not drift from the contract. */
async function domainLists(): Promise<{ importDomains: string[]; resolutionDomains: string[] }> {
  const fallback = { importDomains: [...IMPORT_HOSTS], resolutionDomains: [...RESOLUTION_HOSTS] };
  if (domainCache && Date.now() - domainCache.at < 60_000) {
    return { importDomains: domainCache.importDomains, resolutionDomains: domainCache.resolutionDomains };
  }
  const env = loadEnv();
  if (!env.GENLAYER_CONTRACT_ADDRESS) return domainCache ?? fallback;
  try {
    const client = await genlayerReadClient();
    const address = env.GENLAYER_CONTRACT_ADDRESS as `0x${string}`;
    const [imported, resolution] = await Promise.all([
      client.readContract({ address, functionName: "get_import_domains", args: [] }),
      client.readContract({ address, functionName: "get_resolution_domains", args: [] }),
    ]);
    domainCache = {
      at: Date.now(),
      importDomains: asDomainList(imported, fallback.importDomains),
      resolutionDomains: asDomainList(resolution, fallback.resolutionDomains),
    };
    return { importDomains: domainCache.importDomains, resolutionDomains: domainCache.resolutionDomains };
  } catch {
    return domainCache ?? fallback;
  }
}

function bytesToUtf8(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("0x")) return Buffer.from(trimmed.slice(2), "hex").toString("utf8");
  // Studio returns tx_data as hex with no 0x prefix. Base64 of the same payload is not pure hex.
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 16 && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex").toString("utf8");
  }
  try {
    return Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return trimmed;
  }
}

function decodeCalldata(tx: Record<string, unknown>): string {
  const data = tx.data;
  if (data && typeof data === "object" && "calldata" in data) {
    const inner = (data as { calldata?: unknown }).calldata;
    if (typeof inner === "string" && inner.length > 0) return bytesToUtf8(inner);
  }
  if (typeof data === "string" && data.length > 0) return bytesToUtf8(data);
  if (typeof tx.tx_data === "string" && tx.tx_data.length > 0) return bytesToUtf8(tx.tx_data);
  return "";
}

/** A client hash is stored only when it is a real call to this contract, and a lock only when the sentence matches. */
async function transactionTargetsContract(
  hash: string,
  rpc: string,
  contract: string,
  forecast?: { original_text: string; author: string },
): Promise<"missing" | "foreign" | "failed" | "accepted" | "finalized" | "pending"> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [hash] }),
  });
  if (!response.ok) throw new Error("RPC");
  const body = (await response.json()) as { result?: Record<string, unknown>; error?: { message?: string } };
  if (body.error) {
    if (/not found/i.test(body.error.message || "")) return "missing";
    throw new Error("RPC");
  }
  const tx = body.result;
  if (!tx) return "missing";
  const to = String(tx.to_address || tx.recipient || tx.to || "").toLowerCase();
  if (!to || to !== contract.toLowerCase()) return "foreign";
  if (forecast && String(tx.from_address || tx.sender || tx.from || "").toLowerCase() !== forecast.author.toLowerCase()) return "foreign";
  const status = String(tx.status || "").toUpperCase();
  if (["CANCELED", "CANCELLED", "REJECTED", "UNDETERMINED"].includes(status)) return "failed";
  const payload = decodeCalldata(tx).replace(/\s+/g, " ");
  const isLock = payload.includes("lock_native_forecast") || payload.includes("lock_imported_forecast");
  if (!isLock) return "foreign";
  const text = forecast?.original_text.replace(/\s+/g, " ").trim();
  if (isLock && text && !payload.includes(text)) return "foreign";
  if (status.includes("FINAL")) return "finalized";
  if (status.includes("ACCEPT") || status === "SUCCESS") return "accepted";
  return "pending";
}

function activeScope() {
  const env = loadEnv();
  if (!env.GENLAYER_CONTRACT_ADDRESS) return undefined;
  return { network: env.GENLAYER_NETWORK, contract: env.GENLAYER_CONTRACT_ADDRESS };
}

function historyScope() {
  const scope = activeScope();
  if (!scope) return undefined;
  const env = loadEnv();
  const contracts = [scope.contract, ...env.archivedContractAddresses].map((address) => address.toLowerCase());
  return {
    ...scope,
    contract: scope.contract.toLowerCase(),
    contracts: [...new Set(contracts)],
  };
}

async function indexerStatus() {
  const state = await syncState();
  const lastSuccessAt = state.last_success_at ? Date.parse(state.last_success_at) : 0;
  return {
    current: Boolean(lastSuccessAt && !state.last_error && Date.now() - lastSuccessAt < 10 * 60_000),
    lastSuccessAt: state.last_success_at,
  };
}

let indexRefresh: Promise<void> | null = null;
const SYNC_INTERVAL_MS = 5 * 60_000;

/** Pull contract reads into the index at most every five minutes. A failed read leaves the previous rows in place. */
async function refreshIndex(): Promise<void> {
  if (indexRefresh) {
    try {
      await indexRefresh;
    } catch {
      // The caller that started the refresh already recorded the error.
    }
    return;
  }
  let release: () => void = () => {};
  indexRefresh = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const state = await syncState();
    const stamp = Math.max(
      state.last_success_at ? Date.parse(state.last_success_at) : 0,
      state.last_error_at ? Date.parse(state.last_error_at) : 0,
    );
    if (stamp && Date.now() - stamp < SYNC_INTERVAL_MS) {
      release();
      return;
    }
    const reader = await chainReader();
    const scope = activeScope();
    if (reader && scope) {
      const hints = await indexHints(scope);
      await indexFromReader(reader, {
        network: scope.network,
        contract: scope.contract,
        chainStatus: "accepted",
        knownCount: state.last_forecast_count,
        storedMax: hints.storedMax,
        openIds: hints.openIds,
      });
    }
    release();
  } catch (error) {
    await markSync(false, 0, error instanceof Error ? error.message : "sync failed");
    // Resolve, never reject: the starter already recorded the failure, and a
    // refresh with no concurrent waiter must not surface as an unhandled
    // rejection (which crashes the process).
    release();
  } finally {
    indexRefresh = null;
  }
}

/** Lists answer from the index immediately. The chain catch-up runs behind that response. */
function touchIndex(): void {
  void refreshIndex().catch(() => undefined);
}

async function dispatch(request: Request): Promise<Response> {
  const limited = rateLimit(request, "api", 120);
  if (limited) return limited;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  const method = request.method.toUpperCase();
  const origin = originOf(request);

  try {
    if (method === "GET" && path === "health") {
      return json({ ok: true, service: "calledit", time: new Date().toISOString() });
    }
    if (method === "GET" && path === "ready") {
      const state = await syncState();
      return json({ ok: true, database: "up", indexer: state });
    }
    if (method === "GET" && path === "protocol") {
      const env = loadEnv();
      const domains = await domainLists();
      return json({
        ...publicConfig(),
        ...domains,
        contractConfigured: Boolean(env.GENLAYER_CONTRACT_ADDRESS),
        indexer: await syncState(),
        reputation:
          "accuracy = correct / (correct + incorrect). Open and unresolved forecasts are excluded. Drafts are excluded.",
      });
    }
    if (method === "GET" && path === "forecasts") {
      const parsed = parseForecastListQuery(url.searchParams);
      if ("error" in parsed) {
        const message =
          parsed.error === "STATUS"
            ? "Status must be OPEN, RESOLVED, or ALL."
            : parsed.error === "LIMIT"
              ? "Limit must be an integer from 1 to 50."
            : "Cursor must contain a forecast id and contract address separated by a colon.";
        return fail(400, parsed.error, message);
      }
      touchIndex();
      const scope = historyScope();
      const rows = await listForecasts({
        status: parsed.status ?? undefined,
        limit: parsed.limit,
        cursor: parsed.cursor,
        includeDrafts: parsed.includeDrafts,
        network: scope?.network,
        contracts: scope?.contracts,
      });
      return json({ forecasts: rows, nextCursor: nextCursor(rows, parsed.limit), indexer: await indexerStatus() });
    }
    if (method === "GET" && path === "activity") {
      const parsed = parseForecastListQuery(url.searchParams);
      if ("error" in parsed && parsed.error !== "STATUS") {
        return fail(400, parsed.error, parsed.error === "LIMIT" ? "Limit must be an integer from 1 to 50." : "Cursor must contain a forecast id and contract address separated by a colon.");
      }
      const limit = "error" in parsed ? 20 : parsed.limit;
      touchIndex();
      return json({ activity: await recentActivity(limit, historyScope()), indexer: await indexerStatus() });
    }
    if (method === "GET" && path === "leaderboard") {
      const parsed = parseForecastListQuery(url.searchParams);
      if ("error" in parsed && parsed.error !== "STATUS") {
        return fail(400, parsed.error, parsed.error === "LIMIT" ? "Limit must be an integer from 1 to 50." : "Cursor must contain a forecast id and contract address separated by a colon.");
      }
      const limit = "error" in parsed ? 20 : parsed.limit;
      touchIndex();
      return json({
        formula: "accuracy = correct / (correct + incorrect), open forecasts excluded",
        leaders: await leaderboard(limit, historyScope()),
        indexer: await indexerStatus(),
      });
    }
    const forecastMatch = path.match(/^forecasts\/(\d+)$/);
    if (method === "GET" && forecastMatch) {
      const scope = historyScope();
      const id = Number(forecastMatch[1]);
      const requestedContract = url.searchParams.get("contract")?.toLowerCase();
      if (requestedContract && requestedContract !== "simulator" && !/^0x[a-f0-9]{40}$/.test(requestedContract)) {
        return fail(400, "CONTRACT", "That contract address is invalid.");
      }
      if (requestedContract && requestedContract !== "simulator" && !scope?.contracts.includes(requestedContract)) {
        return fail(400, "CONTRACT", "That contract is not part of CalledIt history.");
      }
      let row = await getForecast(id, scope, requestedContract);
      if (!row || row.status === "OPEN") {
        await refreshIndex();
        row = await getForecast(id, scope, requestedContract);
      } else {
        touchIndex();
      }
      if (!row) return fail(404, "NOT_FOUND", "No forecast with that id is indexed.");
      return json({ forecast: row });
    }
    const profileMatch = path.match(/^profiles\/(0x[a-fA-F0-9]{40})$/);
    if (method === "GET" && profileMatch) {
      const address = profileMatch[1].toLowerCase();
      touchIndex();
      const scope = historyScope();
      return json({ address, forecasts: await profileRows(address, scope), stats: await profileStats(address, scope), indexer: await indexerStatus() });
    }
    const statsMatch = path.match(/^profiles\/(0x[a-fA-F0-9]{40})\/stats$/);
    if (method === "GET" && statsMatch) {
      touchIndex();
      return json({ address: statsMatch[1].toLowerCase(), stats: await profileStats(statsMatch[1], historyScope()), indexer: await indexerStatus() });
    }
    if (method === "GET" && path === "session") {
      return json({ address: await sessionAddress(request, origin) });
    }
    if (method === "POST" && path === "auth/nonce") {
      const authLimit = rateLimit(request, "auth", 20);
      if (authLimit) return authLimit;
      const body = (await readJson(request)) as { address?: string };
      if (!body.address) return fail(400, "ADDRESS", "Send the wallet address.");
      const issued = await issueNonce(body.address, origin);
      return json(issued);
    }
    if (method === "POST" && path === "auth/verify") {
      const body = (await readJson(request)) as { address?: string; nonce?: string; signature?: `0x${string}` };
      if (!body.address || !body.nonce || !body.signature) return fail(400, "BODY", "Address, nonce, and signature are required.");
      const token = await verifyLogin({ address: body.address, nonce: body.nonce, signature: body.signature, origin });
      return json({ ok: true, address: body.address.toLowerCase() }, 200, { "set-cookie": sessionCookie(token, 60 * 60 * 24 * 7) });
    }
    if (method === "POST" && path === "auth/logout") {
      await logout(request);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    }
    if (method === "POST" && path === "indexer/sync") {
      const syncLimit = rateLimit(request, "indexer-sync", 6);
      if (syncLimit) return syncLimit;
      const reader = await chainReader();
      if (!reader) return json({ ok: false, reason: "CONTRACT_NOT_CONFIGURED" });
      const env = loadEnv();
      const scope = { network: env.GENLAYER_NETWORK, contract: env.GENLAYER_CONTRACT_ADDRESS };
      const hints = await indexHints(scope);
      const state = await syncState();
      try {
        const result = await indexFromReader(reader, {
          network: scope.network,
          contract: scope.contract,
          chainStatus: "accepted",
          knownCount: state.last_forecast_count,
          storedMax: hints.storedMax,
          openIds: hints.openIds,
        });
        return json({ ok: true, ...result, chainStatus: "accepted" });
      } catch (error) {
        await markSync(false, 0, error instanceof Error ? error.message : "sync failed");
        return fail(502, "RPC", "The indexer could not read the contract. The forecast state was not changed.");
      }
    }
    if (method === "POST" && path === "indexer/transactions") {
      const body = (await readJson(request)) as { hash?: string; forecastId?: number };
      if (!body.hash || !/^0x[a-fA-F0-9]{64}$/.test(body.hash)) return fail(400, "TX", "Send a 32-byte transaction hash.");
      const env = loadEnv();
      const forecastId = Number(body.forecastId);
      const id = Number.isInteger(forecastId) && forecastId > 0 ? forecastId : undefined;
      if (!id) return fail(400, "FORECAST_ID", "Send the forecast id returned by the lock transaction.");
      const row = await getForecast(id, activeScope());
      if (!row || row.lock_state !== "locked") return fail(404, "NOT_FOUND", "No locked forecast with that id is indexed.");
      let verdict: Awaited<ReturnType<typeof transactionTargetsContract>>;
      try {
        verdict = await transactionTargetsContract(body.hash, env.GENLAYER_RPC_URL, env.GENLAYER_CONTRACT_ADDRESS, row);
      } catch {
        return fail(502, "RPC", "The transaction could not be read, so it was not attached.");
      }
      if (verdict === "missing" || verdict === "foreign" || verdict === "failed") {
        const message =
          verdict === "missing"
            ? "That transaction is not on this network."
            : verdict === "failed"
              ? "That transaction did not succeed, so it was not attached to a receipt."
              : "That transaction does not belong to this forecast.";
        return fail(400, "TX", message);
      }
      await noteTransaction(body.hash, env.GENLAYER_NETWORK, verdict, id, env.GENLAYER_CONTRACT_ADDRESS);
      return json({ ok: true, storedStatus: verdict });
    }
    if (method === "POST" && path === "simulator/forecasts") {
      const env = loadEnv();
      if (!env.allowSimulator) return fail(403, "SIMULATOR_DISABLED", "Local drafts are disabled.");
      const session = await sessionAddress(request, origin);
      const body = (await readJson(request)) as { text?: string; deadline?: string; mode?: string; sourceUrl?: string; address?: string };
      const author = (session || body.address || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(author)) return fail(401, "AUTH", "Connect a wallet address before saving a draft.");
      const text = body.text ?? "";
      const deadline = body.deadline ?? "";
      const check = preflightForecast(text, deadline);
      if (!check.ok) return fail(400, check.code, check.message);
      const mode = body.mode === "IMPORTED" ? "IMPORTED" : "NATIVE";
      const id = await nextDraftId();
      await insertDraft({
        forecastId: id,
        author,
        mode,
        originalText: text.trim(),
        sourceUrl: mode === "IMPORTED" ? body.sourceUrl ?? "" : "",
        deadlineIso: deadline,
      });
      return json({ forecastId: id, lockState: "draft", chainStatus: "simulated" }, 201);
    }
    return fail(404, "NOT_FOUND", "No such API route.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "BODY_TOO_LARGE") return fail(413, "BODY", "That request is too large.");
    if (message === "ADDRESS") return fail(400, "ADDRESS", "That is not a wallet address.");
    if (message === "NONCE") return fail(401, "NONCE", "That sign-in nonce is expired, reused, or for a different site.");
    if (message === "SIGNATURE") return fail(401, "SIGNATURE", "The wallet signature did not match the sign-in message.");
    if (message === "TX") return fail(400, "TX", "Transaction hash must be 32 bytes.");
    if (error instanceof SyntaxError) return fail(400, "JSON", "The request body is not valid JSON.");
    console.error(JSON.stringify({ level: "error", message, path }));
    return fail(500, "INTERNAL", "The request failed. Nothing was silently rewritten.");
  }
}

export async function handleApi(request: Request): Promise<Response> {
  if (request.method.toUpperCase() === "OPTIONS") {
    const response = new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      },
    });
    return applyCors(request, response);
  }
  return applyCors(request, await dispatch(request));
}
