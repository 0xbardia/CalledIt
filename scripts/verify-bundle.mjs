#!/usr/bin/env node
/**
 * Verify that the running server serves the build that is on disk.
 *
 * A rebuild rewrites `.vercel/output`. A PM2 reload whose config has not
 * changed does not restart the worker, so the old worker keeps rendering an
 * asset manifest from the previous build while the static directory holds the
 * new one. The symptom is a live page whose stylesheet and client entry 404 —
 * an unstyled, non-hydrating page that still answers 200 for "/".
 *
 * Run this after every build and restart. It exits non-zero on drift and says
 * exactly what to do.
 *
 *   node scripts/verify-bundle.mjs
 *   BASE_URL=https://calledit.bydx.fun node scripts/verify-bundle.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const STATIC = join(ROOT, ".vercel/output/static");
const ASSETS = join(STATIC, "assets");
const ENTRY = join(ROOT, ".vercel/output/functions/__server.func/index.mjs");
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || "8130"}`).replace(/\/$/, "");
const PATHS = ["/", "/explore", "/forecast/new"];

if (!existsSync(ASSETS)) {
  console.error("verify-bundle: .vercel/output/static/assets is missing. Run `npm run build` first.");
  process.exit(1);
}

let failed = 0;

// 1. The HTML the worker renders must only name files this build produced.
const onDisk = new Set(readdirSync(ASSETS).map((name) => `/assets/${name}`));

if (existsSync(ENTRY)) {
  const bundle = readFileSync(ENTRY, "utf8");
  const orphans = [
    ...new Set([...bundle.matchAll(/["'`](\/assets\/[A-Za-z0-9._-]+)["'`]/g)].map((m) => m[1])),
  ].filter((ref) => !onDisk.has(ref));
  if (orphans.length > 0) {
    console.error(`verify-bundle: the server bundle names ${orphans.length} asset(s) this build does not contain:`);
    for (const ref of orphans.slice(0, 10)) console.error(`  - ${ref}`);
    console.error("  The worker and the static output came from different builds. Rebuild, then restart.");
    failed += 1;
  }
}

// 2. The live responses must only name files this build produced.
for (const path of PATHS) {
  let html;
  try {
    const response = await fetch(BASE + path);
    if (!response.ok) {
      console.error(`verify-bundle: ${path} answered ${response.status}`);
      failed += 1;
      continue;
    }
    html = await response.text();
  } catch (error) {
    console.error(`verify-bundle: ${path} is unreachable (${error.message})`);
    failed += 1;
    continue;
  }

  const refs = [...new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))];
  if (refs.length === 0) {
    console.error(`verify-bundle: ${path} rendered no asset references`);
    failed += 1;
    continue;
  }
  const missing = refs.filter((ref) => !onDisk.has(ref));
  if (missing.length > 0) {
    console.error(`verify-bundle: ${path} references ${missing.length} asset(s) this build does not contain:`);
    for (const ref of missing) console.error(`  - ${ref}`);
    console.error("  The running process is serving a previous build. Restart it:");
    console.error("    pm2 delete calledit && pm2 start ecosystem.config.cjs && pm2 save");
    console.error("  `pm2 startOrReload` is not enough when the PM2 config itself is unchanged.");
    failed += 1;
  } else {
    console.log(`verify-bundle: ${path} ok — ${refs.length} assets match the build on disk`);
  }
}

if (failed > 0) {
  console.error(`\nverify-bundle: ${failed} check(s) failed.`);
  process.exit(1);
}
console.log("verify-bundle: the running server and the build on disk agree.");
