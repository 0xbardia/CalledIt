const path = process.getBuiltinModule("node:path");

// Resolve everything from this file, so a checkout in any directory works
// without editing the config.
const ROOT = __dirname;
// Defaults to the Node that is running PM2. Set NODE_BIN to pin a different
// interpreter, for example a version manager's build.
const NODE = process.env.NODE_BIN || process.execPath;
const PORT = process.env.PM2_PORT || "8130";

const runtimeNames = [
  "APP_URL",
  "DATABASE_URL",
  "CORS_ALLOWED_ORIGINS",
  "GENLAYER_NETWORK",
  "GENLAYER_CHAIN_ID",
  "GENLAYER_RPC_URL",
  "GENLAYER_CONTRACT_ADDRESS",
  "GENLAYER_ARCHIVED_CONTRACT_ADDRESSES",
  "VITE_GENLAYER_NETWORK",
  "VITE_GENLAYER_CHAIN_ID",
  "VITE_GENLAYER_RPC_URL",
  "VITE_GENLAYER_CONTRACT_ADDRESS",
  "VITE_WALLETCONNECT_PROJECT_ID",
  "VITE_PUBLIC_HOSTNAME",
  "LOG_LEVEL",
  "ALLOW_SIMULATOR",
];
const inherited = Object.fromEntries(runtimeNames.map((name) => [name, process.env[name]]));
for (const name of runtimeNames) delete process.env[name];
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const name of runtimeNames) {
  if (process.env[name] === undefined && inherited[name] !== undefined) process.env[name] = inherited[name];
}

const env = {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT,
};
for (const name of runtimeNames) {
  if (process.env[name] !== undefined) env[name] = process.env[name];
}
const keepAmbient = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"]);
const filteredEnvNames = Object.keys(process.env).filter(
  (name) => !runtimeNames.includes(name) && !keepAmbient.has(name),
);

module.exports = {
  apps: [
    {
      name: "calledit",
      cwd: ROOT,
      script: path.join(ROOT, "node_modules", "srvx", "bin", "srvx.mjs"),
      interpreter: NODE,
      args: `serve --prod --host 127.0.0.1 --port ${PORT} --static ${path.join(ROOT, ".vercel", "output", "static")} --entry ${path.join(ROOT, ".vercel", "output", "functions", "__server.func", "index.mjs")}`,
      env,
      filter_env: filteredEnvNames,
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "512M",
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      out_file: path.join(process.env.PM2_HOME || path.join(ROOT, ".pm2"), "logs", "calledit-out.log"),
      error_file: path.join(process.env.PM2_HOME || path.join(ROOT, ".pm2"), "logs", "calledit-error.log"),
    },
  ],
};
