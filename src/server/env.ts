import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.string().default("http://127.0.0.1:8080"),
  PORT: z.string().default("8080"),
  DATABASE_URL: z.string().optional().default(""),
  CORS_ALLOWED_ORIGINS: z.string().default("http://127.0.0.1:8080,http://localhost:8080"),
  GENLAYER_NETWORK: z.string().default("studionet"),
  GENLAYER_CHAIN_ID: z.string().default("61999"),
  GENLAYER_RPC_URL: z.string().default("https://studio.genlayer.com/api"),
  GENLAYER_CONTRACT_ADDRESS: z.string().default(""),
  GENLAYER_ARCHIVED_CONTRACT_ADDRESSES: z.string().default(""),
  LOG_LEVEL: z.string().default("info"),
  ALLOW_SIMULATOR: z.string().default("false"),
});

export type AppEnv = z.infer<typeof schema> & {
  origins: string[];
  archivedContractAddresses: string[];
  allowSimulator: boolean;
  production: boolean;
};

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    GENLAYER_NETWORK: process.env.GENLAYER_NETWORK || process.env.VITE_GENLAYER_NETWORK,
    GENLAYER_CHAIN_ID: process.env.GENLAYER_CHAIN_ID || process.env.VITE_GENLAYER_CHAIN_ID,
    GENLAYER_RPC_URL: process.env.GENLAYER_RPC_URL || process.env.VITE_GENLAYER_RPC_URL,
    GENLAYER_CONTRACT_ADDRESS:
      process.env.GENLAYER_CONTRACT_ADDRESS || process.env.VITE_GENLAYER_CONTRACT_ADDRESS || "",
    GENLAYER_ARCHIVED_CONTRACT_ADDRESSES: process.env.GENLAYER_ARCHIVED_CONTRACT_ADDRESSES,
    LOG_LEVEL: process.env.LOG_LEVEL,
    ALLOW_SIMULATOR: process.env.ALLOW_SIMULATOR,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`CalledIt configuration is invalid (${missing}). Set the keys in the environment.`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOW_SIMULATOR === "true") {
    throw new Error("ALLOW_SIMULATOR must be false in production.");
  }
  const chainIds: Record<string, number> = {
    studionet: 61999,
    "testnet-asimov": 4221,
    "testnet-bradbury": 4221,
  };
  if (chainIds[parsed.data.GENLAYER_NETWORK] !== Number(parsed.data.GENLAYER_CHAIN_ID)) {
    throw new Error("CalledIt GENLAYER_NETWORK and GENLAYER_CHAIN_ID do not match.");
  }
  const pairs: Array<[string, string, (value: string) => string]> = [
    ["GENLAYER_NETWORK", "VITE_GENLAYER_NETWORK", (value) => value.toLowerCase()],
    ["GENLAYER_CHAIN_ID", "VITE_GENLAYER_CHAIN_ID", (value) => String(Number(value))],
    ["GENLAYER_RPC_URL", "VITE_GENLAYER_RPC_URL", (value) => value.trim()],
    ["GENLAYER_CONTRACT_ADDRESS", "VITE_GENLAYER_CONTRACT_ADDRESS", (value) => value.toLowerCase()],
  ];
  for (const [serverName, clientName, normalize] of pairs) {
    const serverValue = process.env[serverName];
    const clientValue = process.env[clientName];
    if (serverValue && clientValue && normalize(serverValue) !== normalize(clientValue)) {
      throw new Error(`CalledIt ${serverName} and ${clientName} do not match.`);
    }
  }
  if (parsed.data.GENLAYER_CONTRACT_ADDRESS && !/^0x[a-fA-F0-9]{40}$/.test(parsed.data.GENLAYER_CONTRACT_ADDRESS)) {
    throw new Error("GENLAYER_CONTRACT_ADDRESS must be a full 20-byte address.");
  }
  let appUrl: URL;
  try {
    appUrl = new URL(parsed.data.APP_URL);
  } catch {
    throw new Error("APP_URL must be a valid absolute URL.");
  }
  const archivedContractAddresses = parsed.data.GENLAYER_ARCHIVED_CONTRACT_ADDRESSES
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  if (archivedContractAddresses.some((address) => !/^0x[a-f0-9]{40}$/.test(address))) {
    throw new Error("GENLAYER_ARCHIVED_CONTRACT_ADDRESSES contains an invalid contract address.");
  }
  const origins = parsed.data.CORS_ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed.data.NODE_ENV === "production" && appUrl.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }
  if (parsed.data.NODE_ENV === "production" && !origins.includes(appUrl.origin)) {
    throw new Error("CORS_ALLOWED_ORIGINS must include the production APP_URL origin.");
  }
  const loaded: AppEnv = {
    ...parsed.data,
    archivedContractAddresses,
    origins,
    allowSimulator: parsed.data.ALLOW_SIMULATOR === "true" && parsed.data.NODE_ENV !== "production",
    production: parsed.data.NODE_ENV === "production",
  };
  cached = loaded;
  return loaded;
}

export function publicConfig() {
  const env = loadEnv();
  return {
    network: env.GENLAYER_NETWORK,
    chainId: Number(env.GENLAYER_CHAIN_ID),
    rpcUrl: env.GENLAYER_RPC_URL,
    contractAddress: env.GENLAYER_CONTRACT_ADDRESS,
    allowSimulator: env.allowSimulator,
    appUrl: env.APP_URL,
  };
}
