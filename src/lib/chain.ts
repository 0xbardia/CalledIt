import { explainChainError } from "./tx-error.ts";

export type TxPhase = "idle" | "approval" | "submitted" | "accepted" | "failed";

type ChainConfig = { contractAddress: string; chainId: number; network: string; rpcUrl: string };

export type LockResult = { hash: string; forecastId: number | null };
export type ResolveResult = { hash: string; verdict: string };

type ReceiptLeader = { result?: { status?: string; payload?: { readable?: string } | string } };
type ChainReceipt = {
  status_name?: string;
  result_name?: string;
  consensus_data?: { leader_receipt?: (ReceiptLeader & { execution_result?: string })[] };
};

async function studioClient(input: { config: ChainConfig; account: `0x${string}`; provider: unknown }) {
  const { createClient } = await import("genlayer-js");
  const chains = await import("genlayer-js/chains");
  const supported = {
    studionet: chains.studionet,
    "testnet-asimov": chains.testnetAsimov,
    "testnet-bradbury": chains.testnetBradbury,
  };
  const chain = supported[input.config.network as keyof typeof supported];
  if (!chain || chain.id !== input.config.chainId) {
    throw new Error("CalledIt GenLayer network and chain id do not match.");
  }
  return createClient({
    chain,
    account: input.account,
    provider: input.provider as never,
    endpoint: input.config.rpcUrl,
  });
}

function cleanReadable(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed.replace(/^[^A-Za-z0-9]+/, "");
}

export function readableResult(receipt: unknown): string {
  const result = receipt as ChainReceipt;
  if (!(["ACCEPTED", "FINALIZED"].includes(String(result.status_name))) || result.result_name !== "MAJORITY_AGREE") {
    throw new Error(explainChainError("GenLayer did not reach majority agreement. The transaction was not accepted."));
  }
  const leader = result.consensus_data?.leader_receipt?.[0];
  const execution = leader?.result?.status ?? "";
  const payload = leader?.result?.payload;
  const readable = typeof payload === "string" ? payload : payload?.readable ?? "";
  const execName = String(leader?.execution_result || "");
  if (execution !== "return" || execName !== "SUCCESS") {
    throw new Error(explainChainError(cleanReadable(readable) || "The contract rejected this transaction. Nothing was written."));
  }
  return cleanReadable(readable);
}

async function receiptClient(input: { config: ChainConfig; account: `0x${string}` }) {
  const { createClient } = await import("genlayer-js");
  const chains = await import("genlayer-js/chains");
  const chain =
    input.config.chainId === chains.testnetBradbury.id
      ? chains.testnetBradbury
      : input.config.chainId === chains.testnetAsimov.id
        ? chains.testnetAsimov
        : chains.studionet;
  // The wallet provider submits the signature. The receipt is read from the network, not through the wallet.
  return createClient({ chain, account: input.account, endpoint: input.config.rpcUrl });
}

async function confirmed(input: { config: ChainConfig; account: `0x${string}` }, hash: `0x${string}`): Promise<string> {
  const reader = await receiptClient(input);
  const receipt = await reader.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    interval: 3000,
    retries: 90,
  } as never);
  return readableResult(receipt);
}

export async function sendLock(input: {
  config: ChainConfig;
  account: `0x${string}`;
  provider: unknown;
  text: string;
  deadline: string;
  mode: "NATIVE" | "IMPORTED";
  sourceUrl?: string;
  onSubmitted?: (hash: string) => void;
}): Promise<LockResult> {
  const client = await studioClient(input);
  const args = input.mode === "IMPORTED" ? [input.text, input.deadline, input.sourceUrl ?? ""] : [input.text, input.deadline];
  const hash = await client.writeContract({
    address: input.config.contractAddress as `0x${string}`,
    functionName: input.mode === "IMPORTED" ? "lock_imported_forecast" : "lock_native_forecast",
    args,
    value: 0n,
  });
  input.onSubmitted?.(hash);
  const readable = await confirmed(input, hash);
  const forecastId = Number(readable);
  return { hash, forecastId: Number.isInteger(forecastId) && forecastId > 0 ? forecastId : null };
}

export async function sendResolve(input: {
  config: ChainConfig;
  account: `0x${string}`;
  provider: unknown;
  forecastId: number;
  evidence: string;
  onSubmitted?: (hash: string) => void;
}): Promise<ResolveResult> {
  const client = await studioClient(input);
  const hash = await client.writeContract({
    address: input.config.contractAddress as `0x${string}`,
    functionName: "resolve_forecast",
    args: [input.forecastId, input.evidence],
    value: 0n,
  });
  input.onSubmitted?.(hash);
  const verdict = await confirmed(input, hash);
  return { hash, verdict };
}
