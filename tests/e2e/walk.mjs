import { mkdirSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8080";
const out = "/workspace/screenshots";
mkdirSync(out, { recursive: true });

const paths = ["/", "/explore", "/forecast/new", "/leaderboard", "/docs", "/security", "/roadmap", "/app", "/missing-page"];

async function walk(browserType, name) {
  const errors = [];
  let browser;
  try {
    browser = await browserType.launch();
  } catch (error) {
    return { name, launched: false, reason: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const pages = [];
  for (const path of paths) {
    const response = await page.goto(base + path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    pages.push({ path, status: response?.status() ?? 0, overflow });
    const file = `${out}/${name}-${path.replace(/\//g, "_") || "home"}.png`;
    await page.screenshot({ path: file, fullPage: false });
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await mobile.goto(base + "/forecast/new", { waitUntil: "networkidle" });
  const draft = mobile.getByRole("button", { name: "Save a labeled local draft" });
  if (await draft.count()) await draft.click();
  const alert = await mobile.locator("[role='alert']").textContent().catch(() => "");
  await mobile.screenshot({ path: `${out}/${name}-new-mobile-dark.png` });
  const paper = await mobile.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await browser.close();
  return { name, launched: true, pages, draftAlert: alert, paper, errors };
}

const report = [];
report.push(await walk(chromium, "chromium"));
report.push(await walk(firefox, "firefox"));
report.push(await walk(webkit, "webkit"));

const draft = await fetch(base + "/api/v1/simulator/forecasts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    text: "BTC will trade above $150,000 before December 31, 2027.",
    deadline: "2027-12-31",
    mode: "NATIVE",
    address: "0x8c1a00000000000000000000000000000000a91e",
  }),
});
const draftBody = await draft.json();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
if (draftBody.forecastId) {
  await page.goto(`${base}/forecast/${draftBody.forecastId}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/chromium-draft-receipt-mobile.png` });
}
await browser.close();
console.log(JSON.stringify({ report, draftStatus: draft.status, draftBody }, null, 2));
