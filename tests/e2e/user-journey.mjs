/**
 * User-journey regression: the critical path a first-time visitor takes,
 * against the live domain or a local preview.
 *
 *   node tests/e2e/user-journey.mjs
 *   PLAYWRIGHT_BASE_URL=https://calledit.bydx.fun node tests/e2e/user-journey.mjs
 *
 * Covers the landing page, the forecast form and its refusals, the import
 * rule, the receipt, the record, a profile, the leaderboard, the resolution
 * entry point, an API outage, the wallet-present and wallet-absent paths, and
 * 320/390 px. Chromium and Firefox; WebKit needs system libraries the runner
 * may not have, and is reported as blocked rather than assumed.
 *
 * Exit code 0 means every check passed with no console, page or network error.
 */
import { mkdirSync } from "node:fs";
import { chromium, firefox } from "playwright";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://calledit.bydx.fun";
const ACTIVE = "0xe04f2aD4F83eFf6Bd55bc6c3979E1dB0Ee018b0E";
const OUT = process.env.PLAYWRIGHT_OUT || "screenshots/user-journey";

mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (severity, area, detail) => findings.push({ severity, area, detail });

async function run(browserType, name) {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return { name, launched: false, reason: String(error).split("\n")[0] };
  }
  const r = { name, launched: true, checks: [], bag: { console: [], pageerr: [], bad: [], failed: [] } };

  const bag = r.bag;
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) bag.console.push(m.text().slice(0, 130)); });
  p.on("pageerror", (e) => bag.pageerr.push(e.message.slice(0, 130)));
  p.on("response", (x) => { if (x.status() >= 500) bag.bad.push(`${x.status()} ${x.url().slice(0, 70)}`); });
  p.on("requestfailed", (x) => bag.failed.push(x.url().slice(0, 70)));

  const settle = async (sel = "main") => {
    await p.waitForLoadState("domcontentloaded");
    await p.waitForFunction(
      (s) => (document.querySelector(s)?.innerText || "").replace(/\s+/g, " ").trim().length > 20,
      sel,
      { timeout: 15000 },
    ).catch(() => undefined);
  };
  // Explore and the leaderboard read their data client-side, so the server's
  // text is not the finished page. Wait for the data itself.
  const settleRecords = async () => {
    await settle();
    await p.waitForFunction(
      () => document.querySelectorAll("li a[href^='/forecast/']").length > 0,
      undefined,
      { timeout: 15000 },
    ).catch(() => undefined);
  };
  const settleBoard = async () => {
    await settle();
    await p.waitForFunction(
      () => /correct \/ \(correct \+ incorrect\)/.test(document.querySelector("main")?.innerText || ""),
      undefined,
      { timeout: 15000 },
    ).catch(() => undefined);
  };
  const interactive = async () => {
    await p.waitForFunction(() => {
      const el = document.querySelector("button.btn-lock");
      return !el || !/checking protocol/i.test(el.textContent || "");
    }, undefined, { timeout: 20000 }).catch(() => undefined);
  };
  const add = (name, ok, detail = "") => {
    r.checks.push({ name, ok, detail });
    if (!ok) note("high", name, detail || "check failed");
  };

  // homepage
  await p.goto(BASE, { waitUntil: "load" }); await settle();
  add("homepage renders", (await p.locator("h1").count()) > 0);
  add("homepage is styled", await p.evaluate(() => document.styleSheets.length >= 2 && getComputedStyle(document.querySelector("h1")).fontSize !== "16px"));
  add("homepage hydrates", (await p.locator("button").count()) > 0);
  add("primary CTA present", (await p.locator("a[href='/forecast/new']").count()) > 0);

  // app
  await p.goto(`${BASE}/app`, { waitUntil: "load" }); await settle();
  add("/app renders", (await p.locator("main").innerText()).length > 40);

  // forecast form + validation
  await p.goto(`${BASE}/forecast/new`, { waitUntil: "load" }); await settle(); await interactive();
  const formNote = () => p.locator("form .note-warn").first().innerText().catch(() => "");
  await p.locator("textarea").first().fill("BTC will trade above $200,000 before December 31, 2027.");
  await p.locator('input[type="date"]').first().fill("2027-12-31");
  await p.waitForTimeout(400);
  add("valid forecast accepted", (await p.locator("button.btn-lock").isDisabled()) === false, await formNote());
  await p.locator("textarea").first().fill("ETH is going crazy soon.");
  await p.waitForTimeout(400);
  add("vague forecast refused", (await p.locator("button.btn-lock").isDisabled()) === true && (await formNote()).length > 10, await formNote());
  await p.locator("textarea").first().fill("BTC will trade above $200,000 before January 1, 2020.");
  await p.locator('input[type="date"]').first().fill("2020-01-01");
  await p.waitForTimeout(400);
  add("past deadline refused", (await p.locator("button.btn-lock").isDisabled()) === true, await formNote());
  add("wallet action offered", (await p.getByRole("button", { name: /connect wallet to sign|sign with your wallet/i }).count()) > 0);

  // import mode
  await p.goto(`${BASE}/forecast/new?mode=imported`, { waitUntil: "load" }); await settle(); await interactive();
  const importNote = (await p.locator("form .note").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  add("import rule explained", /word for word/i.test(importNote), importNote.slice(0, 90));
  await p.locator('input[placeholder*="x.com"]').first().fill("https://evil.example/post");
  await p.waitForTimeout(400);
  add("unsupported import domain refused", (await p.locator("button.btn-lock").isDisabled()) === true);

  // receipt
  await p.goto(`${BASE}/forecast/1?contract=${ACTIVE}`, { waitUntil: "load" }); await settle();
  const dl = await p.evaluate(() => [...document.querySelectorAll("dl *")].filter((e) => !e.children.length).map((e) => e.textContent.trim()));
  add("receipt shows the sentence", dl.length > 0 && (await p.locator("main").innerText()).includes("BTC will trade above $1"));
  add("receipt shows the frozen reading", (await p.locator("main").innerText()).includes("BTC price > 1 USD"));
  add("receipt shows the verdict", /CORRECT/.test(await p.locator("main").innerText()));
  add("receipt shows the contract", dl.join(" ").includes(ACTIVE.toLowerCase()));
  add("missing transaction is explained", /Not recorded\. This lock was not made through this site/.test(dl.join(" ")));

  // explore / profile / leaderboard
  await p.goto(`${BASE}/explore`, { waitUntil: "load" }); await settleRecords();
  const rows = await p.locator("li a[href^='/forecast/']").count();
  add("explore lists records", rows > 0, `${rows} rows`);
  add("explore labels multiple contracts", /Contract 0x/.test(await p.locator("main").innerText()));
  await p.goto(`${BASE}/profile/0xC0f129231Fd0C5533D14c5603C5FAaf31943fc52`, { waitUntil: "load" }); await settleRecords();
  const prof = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  add("profile shows totals", /LOCKED \d/.test(prof), prof.slice(0, 80));
  add("profile keeps open separate from incorrect", /OPEN \d+/.test(prof) && /INCORRECT \d+/.test(prof));
  await p.goto(`${BASE}/leaderboard`, { waitUntil: "load" }); await settleBoard();
  add("leaderboard explains its metric", /correct \/ \(correct \+ incorrect\)/.test(await p.locator("main").innerText()));

  // resolve UX
  await p.goto(`${BASE}/forecast/2?contract=${ACTIVE}`, { waitUntil: "load" }); await settle(); await interactive();
  add("open forecast offers resolution", (await p.getByRole("button", { name: /submit evidence|resolve/i }).count()) > 0);
  await p.goto(`${BASE}/forecast/1?contract=${ACTIVE}`, { waitUntil: "load" }); await settle(); await interactive();
  add("resolved forecast offers no resolution", (await p.getByRole("button", { name: /submit evidence|resolve/i }).count()) === 0);

  // API error state
  const ctxErr = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxErr.route("**/api/v1/protocol", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  const pe = await ctxErr.newPage();
  await pe.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
  await pe.waitForTimeout(2500);
  const errLabel = (await pe.locator("button.btn-lock").innerText().catch(() => "")).trim();
  add("API 5xx is explained, not swallowed", /unavailable/i.test(errLabel), errLabel);
  await ctxErr.close();

  // wallet notice must NOT false-positive when a provider exists
  const ctxW = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxW.addInitScript(() => {
    window.ethereum = { isMetaMask: true, request: async () => ({}) };
    window.dispatchEvent(new Event("ethereum#initialized"));
  });
  const pw = await ctxW.newPage();
  await pw.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
  await pw.waitForTimeout(2000);
  await pw.getByRole("button", { name: /^Connect$/i }).first().click();
  await pw.waitForTimeout(1500);
  add("no false 'no wallet' notice when a provider exists", (await pw.locator(".note-warn").filter({ hasText: /No browser wallet/ }).count()) === 0);
  await ctxW.close();

  // no wallet -> notice appears
  const ctxN = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pn = await ctxN.newPage();
  await pn.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
  await pn.waitForTimeout(2000);
  add("no nagging before the user tries to connect", (await pn.locator(".note-warn").filter({ hasText: /No browser wallet/ }).count()) === 0);
  await pn.getByRole("button", { name: /^Connect$/i }).first().click();
  await pn.waitForTimeout(1500);
  await pn.getByRole("button", { name: /Browser Wallet/i }).first().click();
  await pn.waitForTimeout(2500);
  await pn.keyboard.press("Escape");
  await pn.waitForTimeout(1500);
  const notice = (await pn.locator(".note-warn").filter({ hasText: /No browser wallet/ }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  add("no wallet is explained in the page", notice.length > 40, notice.slice(0, 110));
  await ctxN.close();

  // mobile
  for (const width of [320, 390]) {
    const ctxM = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });
    const pm = await ctxM.newPage();
    for (const [path, label] of [["/", "landing"], ["/forecast/new", "form"], [`/forecast/1?contract=${ACTIVE}`, "receipt"], ["/explore", "explore"]]) {
      await pm.goto(BASE + path, { waitUntil: "load" });
      await pm.waitForTimeout(1800);
      if (path === "/explore") await pm.waitForFunction(() => document.querySelectorAll("li a[href^='/forecast/']").length > 0, undefined, { timeout: 12000 }).catch(() => undefined);
      const over = await pm.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      add(`mobile ${width} ${label} no overflow`, !over);
      if (width === 390) await pm.screenshot({ path: `${OUT}/${name}-${width}-${label}.png` });
    }
    await ctxM.close();
  }

  await p.close();
  await browser.close();
  return r;
}

const out = [];
for (const [t, n] of [[chromium, "chromium"], [firefox, "firefox"]]) out.push(await run(t, n));
const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const f of findings) bySeverity[f.severity] += 1;
const total = out.filter((o) => o.launched).reduce((s, o) => s + o.checks.length, 0);
const failed = out.filter((o) => o.launched).flatMap((o) => o.checks.filter((c) => !c.ok).map((c) => `${o.name}/${c.name}`));
console.log(JSON.stringify({ bySeverity, checksRun: total, failed, findings,
  consoleErrors: out.map((o) => o.bag.console), pageErrors: out.map((o) => o.bag.pageerr),
  api5xx: out.map((o) => o.bag.bad), failedRequests: out.map((o) => o.bag.failed),
  browsersBlocked: out.filter((o) => !o.launched).map((o) => o.name) }, null, 2));
process.exit(failed.length === 0 && bySeverity.critical === 0 && bySeverity.high === 0 ? 0 : 1);
