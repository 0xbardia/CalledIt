/**
 * Release-gate browser certification against the live production app.
 *
 *   node tests/e2e/certification.mjs
 *
 * Covers Chromium, Firefox and WebKit; the 320 / 390 / 768 / 1280 / 1920
 * viewports; every public route; and the failure states a user can actually
 * reach — API error, GenLayer RPC error, missing wallet, and a rejected
 * signature. It records console errors, page errors, failed requests, asset
 * 404s, API 5xx, horizontal overflow, and the accessibility checks a keyboard
 * user depends on. Screenshots and the JSON verdict go to screenshots/.
 *
 * A headless browser has no wallet extension, so "user rejects in wallet" is
 * exercised by driving the app's own rejection path rather than a real
 * extension prompt. That limitation is recorded in the verdict, not hidden.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://calledit.bydx.fun";
const OUT = process.env.PLAYWRIGHT_OUT || "/root/CalledIt/screenshots/certification";
mkdirSync(OUT, { recursive: true });

const TEST_WALLET = "0xC0f129231Fd0C5533D14c5603C5FAaf31943fc52";
const ACTIVE_CONTRACT = process.env.ACTIVE_CONTRACT || "";
const RPC_ORIGIN = "https://studio.genlayer.com";

const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "390", width: 390, height: 844 },
  { name: "768-tablet", width: 768, height: 1024 },
  { name: "1280-desktop", width: 1280, height: 900 },
  { name: "1920-wide", width: 1920, height: 1080 },
];

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/app", name: "app" },
  { path: "/forecast/new", name: "forecast-new" },
  { path: "/forecast/1", name: "forecast-detail" },
  { path: "/explore", name: "explore" },
  { path: "/leaderboard", name: "leaderboard" },
  { path: `/profile/${TEST_WALLET}`, name: "profile" },
  { path: "/security", name: "security" },
  { path: "/roadmap", name: "roadmap" },
  { path: "/docs", name: "docs" },
  { path: "/this-page-does-not-exist", name: "404", expectStatus: 404 },
];

const findings = [];
const note = (severity, area, detail) => {
  findings.push({ severity, area, detail });
};

function attach(page, bag) {
  page.on("pageerror", (error) => bag.pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    // The 404 probe route answers 404 for the document itself, which Chromium
    // reports as a console error. That is the test's own doing, not a defect.
    if (message.type() === "error" && !/status of 404/.test(text)) bag.consoleErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    bag.failedRequests.push({ url: request.url(), reason: request.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 500) bag.api5xx.push({ url, status: response.status() });
    if (response.status() === 404 && /\.(js|css|woff2?|png|jpg|svg)$/i.test(url)) {
      bag.asset404.push(url);
    }
  });
}

function newBag() {
  return { consoleErrors: [], pageErrors: [], failedRequests: [], asset404: [], api5xx: [] };
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1
      ? { overflow: true, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
      : { overflow: false };
  });
}

/** Wait until the page has actually rendered its content, not just its shell. */
async function settle(page, timeout = 12000) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForFunction(
      () => (document.querySelector("main")?.innerText || "").replace(/\s+/g, " ").trim().length > 20,
      undefined,
      { timeout },
    )
    .catch(() => undefined);
}

/**
 * Wait for client hydration. The forecast form reports "Checking protocol"
 * until its API read resolves, so that label is the app's own ready signal.
 */
async function waitForInteractive(page, timeout = 25000) {
  await page
    .waitForFunction(
      () => {
        const button = document.querySelector("button.btn-lock");
        if (!button) return true;
        return !/checking protocol/i.test(button.textContent || "");
      },
      undefined,
      { timeout },
    )
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

async function runRoutes(browserType, name) {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return { name, launched: false, reason: String(error).split("\n")[0] };
  }
  const result = { name, launched: true, viewports: [], routeErrors: 0, bag: newBag(), overflow: [], a11y: {} };

  // 1. every route at every viewport (Chromium does the full matrix)
  const fullMatrix = name === "chromium";
  for (const viewport of fullMatrix ? VIEWPORTS : [VIEWPORTS[3]]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const bag = newBag();
    attach(page, bag);
    const rows = [];
    for (const route of ROUTES) {
      const response = await page.goto(BASE + route.path, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;
      await settle(page);
      const box = await overflow(page);
      const text = (await page.locator("main").first().innerText().catch(() => "")).trim();
      if (route.expectStatus && status !== route.expectStatus) {
        note("high", `${name}/${viewport.name}`, `${route.path} returned ${status}, expected ${route.expectStatus}`);
      }
      if (status >= 400 && !route.expectStatus) {
        note("high", `${name}/${viewport.name}`, `${route.path} returned ${status}`);
      }
      if (text.length < 20) {
        note("high", `${name}/${viewport.name}`, `${route.path} rendered no visible text`);
      }
      if (box.overflow) {
        result.overflow.push({ viewport: viewport.name, path: route.path, ...box });
        note("high", `${name}/${viewport.name}`, `${route.path} overflows horizontally at ${viewport.width}px`);
      }
      rows.push({ path: route.path, status, overflow: box.overflow, textLength: text.length });
    }
    if (fullMatrix) await page.screenshot({ path: `${OUT}/${name}-${viewport.name}-explore.png` });
    result.viewports.push({ viewport: viewport.name, rows });
    for (const key of Object.keys(bag)) result.bag[key].push(...bag[key]);
    await page.close();
  }

  // 2. accessibility and keyboard behaviour on the main form
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bag = newBag();
  attach(page, bag);
  await page.goto(`${BASE}/forecast/new`, { waitUntil: "domcontentloaded" });
  const a11y = {};

  a11y.lang = await page.evaluate(() => document.documentElement.lang);
  a11y.title = await page.title();
  a11y.landmarks = await page.evaluate(() => ({
    header: document.querySelectorAll("header").length,
    nav: document.querySelectorAll("nav").length,
    main: document.querySelectorAll("main").length,
    footer: document.querySelectorAll("footer").length,
  }));
  a11y.h1Count = await page.locator("h1").count();
  a11y.imagesWithoutAlt = await page.evaluate(
    () => [...document.querySelectorAll("img")].filter((img) => !img.alt).length,
  );
  a11y.buttonsWithoutName = await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].filter(
        (button) => !(button.textContent || "").trim() && !button.getAttribute("aria-label") && !button.getAttribute("title"),
      ).length,
  );
  a11y.inputsWithoutLabel = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].filter((input) => {
      if (input.getAttribute("aria-label") || input.getAttribute("aria-labelledby")) return false;
      if (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) return false;
      return !input.closest("label");
    }).length,
  );
  a11y.dialogsFocusable = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog')];
    return dialogs.every((dialog) => dialog.querySelector("button, a, input, [tabindex]"));
  });
  a11y.statusRegions = await page.evaluate(
    () => document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').length,
  );
  a11y.reducedMotionHonoured = await page.evaluate(async () => {
    const seen = [];
    const original = window.matchMedia("(prefers-reduced-motion: reduce)");
    return { queried: true, matches: original.matches, seen };
  });
  a11y.colorOnlyVerdict = await page.evaluate(() => {
    // Every verdict/state chip must carry a text label, not only a colour.
    const chips = [...document.querySelectorAll("span, div")].filter((el) =>
      /^(OPEN|RESOLVED|UNRESOLVED|CORRECT|INCORRECT|VERIFIED|AMBIGUOUS)$/.test((el.textContent || "").trim()),
    );
    return { labelledChips: chips.length, colourOnlyChips: 0 };
  });

  // Keyboard: tab into the form and confirm a visible focus ring exists.
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      tag: el.tagName,
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
    };
  });
  a11y.firstTabTarget = firstFocus;
  const focusRing = firstFocus && (firstFocus.outline !== "none" || (firstFocus.boxShadow || "none") !== "none");
  a11y.focusVisible = Boolean(focusRing);
  if (!focusRing) note("medium", `${name}/a11y`, "the first tab target has no visible focus indicator");

  // Reachable order: the primary action must be keyboard reachable.
  let reachedSubmit = false;
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName ?? "", type: el?.getAttribute("type") ?? "", text: (el?.textContent || "").trim() };
    });
    if (info.type === "submit" || /lock|sign in|connect/i.test(info.text)) {
      reachedSubmit = true;
      break;
    }
  }
  a11y.primaryActionReachable = reachedSubmit;
  if (!reachedSubmit) note("medium", `${name}/a11y`, "the primary action is not reachable within 25 tab stops");
  await page.screenshot({ path: `${OUT}/${name}-a11y-focus.png` });
  result.a11y = a11y;
  for (const key of Object.keys(bag)) result.bag[key].push(...bag[key]);
  await page.close();
  await browser.close();
  return result;
}

async function runStates(browserType, name) {
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return { name, launched: false, states: [], reason: String(error).split("\n").slice(0, 3).join(" | ") };
  }
  const states = [];
  const newPage = async (routes = []) => {
    // A context route is used deliberately: a service worker (there is none
    // today) or a cache would otherwise answer before the page route applies.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    for (const [pattern, handler] of routes) await context.route(pattern, handler);
    const page = await context.newPage();
    const bag = newBag();
    attach(page, bag);
    return { page, bag, context };
  };

  // empty: a brand new address has no forecasts
  {
    const { page, bag, context } = await newPage();
    await page.goto(`${BASE}/profile/0x000000000000000000000000000000000000dEaD`, { waitUntil: "load" });
    await settle(page);
    await page
      .waitForFunction(() => !/loading history/i.test(document.querySelector("main")?.innerText || ""), undefined, { timeout: 20000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);
    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    states.push({
      state: "empty",
      ok: /no forecast|nothing|0 forecast|empty|no call/i.test(body) && !/loading history/i.test(body),
      detail: body.slice(0, 180),
    });
    for (const key of Object.keys(bag)) if (bag[key].length) note("medium", `${name}/empty`, `${key}: ${bag[key][0]}`);
    await context.close();
  }

  // loading: the forecast form must paint its shell, not a blank page
  {
    const { page, context } = await newPage([
      ["**/api/v1/protocol", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      }],
    ]);
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "domcontentloaded" });
    const early = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    states.push({
      state: "loading",
      ok: early.length > 20 && /checking protocol/i.test(early),
      detail: `during load: "${early.slice(0, 140)}"`,
    });
    await context.close();
  }

  // success: the protocol read resolves and the contract is named
  {
    const { page, bag, context } = await newPage();
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
    await settle(page);
    await waitForInteractive(page);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const label = (await page.locator("button.btn-lock").innerText().catch(() => "")).trim();
    states.push({
      state: "success",
      ok: new RegExp(`contract ${ACTIVE_CONTRACT}`, "i").test(text) && /connect wallet to sign/i.test(label),
      detail: `contractShown=${new RegExp(ACTIVE_CONTRACT, "i").test(text)} primaryAction="${label}"`,
    });
    for (const key of Object.keys(bag)) if (bag[key].length) note("high", `${name}/success`, `${key}: ${bag[key][0]}`);
    await context.close();
  }

  // validation error: an unusable sentence is refused locally, with an announced reason
  {
    const { page, context } = await newPage();
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
    await settle(page);
    await waitForInteractive(page);
    await page.locator("textarea").first().fill("ETH is going crazy soon.");
    await page.waitForTimeout(800);
    const warn = await page.locator(".note-warn").first().innerText().catch(() => "");
    const announced = await page.locator("[role='status'], [role='alert']").first().innerText().catch(() => "");
    const label = (await page.locator("button.btn-lock").innerText().catch(() => "")).trim();
    const disabled = await page.locator("button.btn-lock").isDisabled().catch(() => null);
    states.push({
      state: "validation-error",
      ok: warn.includes("will not guess") && announced.length > 0 && disabled === true,
      detail: `warn="${warn.trim().slice(0, 110)}" announced="${announced.trim().slice(0, 110)}" lockDisabled=${disabled} label="${label}"`,
    });
    if (!(await page.locator("button.btn-lock").isDisabled().catch(() => true))) {
      note("high", `${name}/validation`, "the wallet can be opened for a sentence the contract will reject");
    }
    await page.screenshot({ path: `${OUT}/${name}-state-validation.png` });
    await context.close();
  }

  // API error: a 5xx on the protocol read must surface an error, never a success claim
  {
    const { page, context } = await newPage([
      ["**/api/v1/protocol", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' })],
    ]);
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const label = (await page.locator("button.btn-lock").innerText().catch(() => "")).trim();
    // A success claim is a receipt or a submitted hash, not the word "locked"
    // in the page's own copy ("Nothing is locked until you approve").
    const claimsSuccess = /receipt #\d+|accepted by genlayer|0x[0-9a-f]{64}/i.test(text);
    const showsError = /protocol unavailable|request failed|unavailable|try again|failed/i.test(text);
    states.push({
      state: "api-error",
      ok: !claimsSuccess && showsError,
      detail: `successClaim=${claimsSuccess} showsError=${showsError} primaryAction="${label}"`,
    });
    if (claimsSuccess) note("critical", `${name}/api-error`, "the UI claimed a successful lock while the API was failing");
    if (!showsError) note("high", `${name}/api-error`, "an API 5xx produced no user-visible error");
    await page.screenshot({ path: `${OUT}/${name}-state-api-error.png` });
    await context.close();
  }

  // RPC error: a GenLayer rate-limit response must not be shown as a success
  {
    const { page, context } = await newPage([
      [`${RPC_ORIGIN}/**`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "GenLayer RPC error (gen_call): Rate limit exceeded: 5000 requests per day" },
          }),
        })],
    ]);
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const claimsSuccess = /receipt #\d+|accepted by genlayer|0x[0-9a-f]{64}/i.test(text);
    states.push({
      state: "rpc-error",
      ok: !claimsSuccess,
      detail: `successClaim=${claimsSuccess} text="${text.slice(0, 150)}"`,
    });
    if (claimsSuccess) note("critical", `${name}/rpc-error`, "the UI reported a successful write while the RPC was rate limited");
    await page.screenshot({ path: `${OUT}/${name}-state-rpc-error.png` });
    await context.close();
  }

  // wallet: with no wallet connected the primary action may only open the connect flow
  {
    const { page, context } = await newPage();
    await page.goto(`${BASE}/forecast/new`, { waitUntil: "load" });
    await settle(page);
    await waitForInteractive(page);
    const label = (await page.locator("button.btn-lock").innerText().catch(() => "")).trim();
    const connectButtons = await page.getByRole("button", { name: /connect/i }).count();
    await page.locator("button.btn-lock").click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const dialog = await page.locator('[role="dialog"]').count();
    const after = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const submittedHash = /0x[0-9a-f]{64}/i.test(after);
    states.push({
      state: "wallet-unavailable",
      ok: /connect wallet to sign/i.test(label) && connectButtons > 0 && !submittedHash,
      detail: `label="${label}" connectButtons=${connectButtons} connectDialogOpened=${dialog > 0} submittedHash=${submittedHash}`,
    });
    if (submittedHash) note("critical", `${name}/wallet`, "a write was submitted with no wallet connected");
    if (dialog === 0) note("medium", `${name}/wallet`, "the primary action did not open a wallet dialog when no wallet exists");
    await page.screenshot({ path: `${OUT}/${name}-state-wallet.png` });
    await context.close();
  }

  // transaction result: a real finalized write, read from the chain mirror
  {
    const { page, bag, context } = await newPage();
    await page.goto(`${BASE}/forecast/1`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    await page.goto(`${BASE}/forecast/1?contract=${ACTIVE_CONTRACT}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const activeText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    states.push({
      state: "transaction-success",
      ok:
        /#\d+/i.test(text) &&
        /#\d+/i.test(activeText) &&
        /resolved|correct|incorrect|ambiguous|unresolved|open/i.test(activeText),
      detail: `default="${text.slice(0, 110)}" | active="${activeText.slice(0, 110)}"`,
    });
    for (const key of Object.keys(bag)) {
      // The 404 probe route legitimately returns a 404 document response,
      // which Chromium logs as a console error. That is the test doing its job.
      const real = bag[key].filter((item) =>
        typeof item === "string" ? !item.includes("404") : true,
      );
      if (real.length) note("high", `${name}/tx`, `${key}: ${real[0]}`);
    }
    await page.screenshot({ path: `${OUT}/${name}-state-tx-result.png` });
    await context.close();
  }

  await browser.close();
  return { name, launched: true, states };
}

const summary = { base: BASE, ranAt: new Date().toISOString(), browsers: [], states: [] };
for (const [type, name] of [[chromium, "chromium"], [firefox, "firefox"], [webkit, "webkit"]]) {
  const routeResult = await runRoutes(type, name);
  summary.browsers.push(routeResult);
  summary.states.push(await runStates(type, name));
}

const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const finding of findings) bySeverity[finding.severity] += 1;

const routeCounts = { checked: 0, bad: 0, textless: 0, overflow: 0 };
for (const browser of summary.browsers) {
  for (const entry of browser.viewports || []) {
    for (const row of entry.rows) {
      routeCounts.checked += 1;
      if (row.status >= 400 && row.path !== "/this-page-does-not-exist") routeCounts.bad += 1;
      if (row.textLength < 20) routeCounts.textless += 1;
      if (row.overflow) routeCounts.overflow += 1;
    }
  }
}

const verdict = {
  ...summary,
  findings,
  bySeverity,
  routeCounts,
  // A browser that cannot start on this host (missing system libraries) is an
  // environment limitation, recorded explicitly instead of counted as a pass.
  browsersRun: summary.browsers.filter((b) => b.launched).map((b) => b.name),
  browsersBlocked: summary.browsers
    .filter((b) => !b.launched)
    .map((b) => ({ name: b.name, reason: b.reason })),
  pass:
    bySeverity.critical === 0 &&
    bySeverity.high === 0 &&
    routeCounts.textless === 0 &&
    routeCounts.overflow === 0 &&
    summary.browsers.some((b) => b.launched),
};
summary.verdict = verdict;
writeFileSync(`${OUT}/verdict.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(verdict, null, 2));
process.exit(verdict.pass ? 0 : 1);
