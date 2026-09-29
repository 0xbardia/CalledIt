/**
 * Deploy CalledIt to hosted Studionet and exercise every public read.
 * Writes evidence JSON. Never prints the signing key.
 *
 * Usage: node scripts/studio-certify.mjs
 * Key: GENLAYER_DEPLOYER_PRIVATE_KEY in the environment or .env (gitignored).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const RPC = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const SOURCE = readFileSync(new URL("../contracts/calledit.py", import.meta.url), "utf8");
const OUT = new URL("../docs/studio-evidence.json", import.meta.url);

function readEnvFile() {
  try {
    return readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
}

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const match = readEnvFile().match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message || JSON.stringify(body.error)}`);
  return body.result;
}

const evidence = {
  network: "studionet",
  chainId: null,
  rpc: RPC,
  sourceSha256: createHash("sha256").update(SOURCE).digest("hex"),
  deployed: false,
  contractAddress: null,
  deploymentTx: null,
  deploymentStatus: null,
  reads: [],
  writes: [],
  error: null,
  startedAt: new Date().toISOString(),
};

function save() {
  writeFileSync(OUT, JSON.stringify(evidence, null, 2));
}

try {
  evidence.chainId = await rpc("eth_chainId", []);
  const key = envValue("GENLAYER_DEPLOYER_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY is not configured");
  const account = createAccount(key);
  evidence.deployer = account.address;
  const balanceBefore = await rpc("eth_getBalance", [account.address, "latest"]);
  if (BigInt(balanceBefore) < 10n ** 17n) {
    await rpc("sim_fundAccount", [account.address, 1_000_000_000_000_000_000]);
  }
  evidence.balanceWei = await rpc("eth_getBalance", [account.address, "latest"]);

  const client = createClient({ chain: studionet, account, endpoint: RPC });
  const hash = await client.deployContract({ code: SOURCE, args: [] });
  evidence.deploymentTx = hash;
  save();
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: "FINALIZED",
    interval: 4000,
    retries: 90,
  });
  evidence.deploymentStatus = receipt.status_name || receipt.statusName || receipt.status || null;
  evidence.deploymentResult = receipt.result_name || receipt.resultName || null;
  const data = receipt.data || {};
  const decoded = receipt.txDataDecoded;
  const address =
    data.contract_address ||
    data.contractAddress ||
    (decoded && decoded.contractAddress) ||
    null;
  evidence.contractAddress = address || null;
  evidence.deployed = Boolean(address) && String(evidence.deploymentResult || "").includes("AGREE") && !JSON.stringify(receipt.consensus_data || {}).includes("invalid_contract");
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  if (leader?.result?.status && leader.result.status !== "return") {
    evidence.execution = leader.result;
    evidence.deployed = false;
  }
  if (!evidence.deployed || !address) {
    throw new Error(evidence.execution ? `Deploy failed: ${JSON.stringify(evidence.execution)}` : "Deploy did not produce a working contract");
  }
  const count = Number(await client.readContract({ address, functionName: "get_forecast_count", args: [] }));
  const reads = [
    ["get_protocol", []],
    ["get_forecast_count", []],
    ["get_resolution_domains", []],
    ["get_import_domains", []],
    ["get_admin", []],
    ["get_policy_version", []],
    ["is_source_domain_allowed", ["coingecko.com"]],
    ["is_source_domain_allowed", ["evil.example"]],
    ["is_import_domain_allowed", ["x.com"]],
    ["is_import_domain_allowed", ["localhost"]],
    ["preview_url_policy", ["https://www.coingecko.com/en/coins/bitcoin", "resolution"]],
    ["preview_url_policy", ["http://www.coingecko.com/en/coins/bitcoin", "resolution"]],
    ["preview_url_policy", ["https://127.0.0.1/secret", "resolution"]],
    ["preview_url_policy", ["https://user:pass@x.com/a", "import"]],
    ["get_author_forecast_ids", [account.address, 0, 10]],
    ["get_forecast", [1]],
    ["get_forecast_status", [1]],
    ["get_forecast_author", [1]],
    ["get_forecast_interpretation", [1]],
    ["get_forecast_verdict", [1]],
  ];

  for (const [functionName, args] of reads) {
    const row = { functionName, args, ok: false, result: null, error: null, expected: null };
    const needsRow = ["get_forecast", "get_forecast_status", "get_forecast_author", "get_forecast_interpretation", "get_forecast_verdict"].includes(functionName);
    if (needsRow && count < 1) {
      row.skipped = "Requires a stored forecast; tested by studio-lifecycle.mjs after a successful lock.";
    } else try {
      row.result = await client.readContract({ address, functionName, args });
      row.ok = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      row.error = message;
    }
    evidence.reads.push(row);
    save();
  }
  evidence.readsPassed = evidence.reads.every((row) => row.ok || row.skipped);
  evidence.pendingIdReads = evidence.reads.filter((row) => row.skipped).map((row) => row.functionName);
  evidence.certifiedReads = false;
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({
    deployed: evidence.deployed,
    contractAddress: evidence.contractAddress,
    deploymentTx: evidence.deploymentTx,
    deploymentStatus: evidence.deploymentStatus,
    certifiedReads: evidence.certifiedReads || false,
    error: evidence.error,
    reads: evidence.reads.map((row) => ({ name: row.functionName, ok: row.ok, error: row.error })),
  }, null, 2));
}
