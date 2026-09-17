import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/workspace/screenshots/demo";
mkdirSync(OUT, { recursive: true });

const LOCAL = "http://127.0.0.1:8080/";
const HOME = "https://justonejewelry.github.io/Chicas-Map/";
const ATLAS = "https://justonejewelry.github.io/Chicas-Map/atlas/";

async function shot(page, name) {
  const path = `${OUT}/${name}`;
  await page.screenshot({ path, type: "png" });
  console.log("wrote", path);
}

async function waitText(page, re, ms = 20000) {
  await page.waitForFunction(
    (pattern) => {
      const t = document.body ? document.body.innerText : "";
      return new RegExp(pattern, "i").test(t);
    },
    re,
    { timeout: ms },
  );
}

const browser = await chromium.launch({
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5,
  locale: "en-US",
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

try {
  await page.goto(LOCAL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  try {
    await waitText(page, "on scene|en escena|Live dispatch|Despacho", 22000);
  } catch {
    console.log("live text wait timed out");
  }
  await page.waitForTimeout(2000);
  await shot(page, "01-live-map.png");

  const liveTab = page.getByRole("button", { name: /live|en vivo/i }).first();
  if (await liveTab.count()) await liveTab.click();
  await page.waitForTimeout(800);
  // Expand sheet if collapsed
  const expand = page.getByRole("button", { name: /expand/i });
  if (await expand.count()) {
    try {
      await expand.click({ timeout: 1500 });
    } catch {}
  }
  await page.waitForTimeout(500);
  await shot(page, "02-live-board.png");

  // Click first live call if present
  const call = page.locator("button, li, article").filter({ hasText: /DR|RD|ST|AVE|BLVD|LN|WAY/ }).first();
  if (await call.count()) {
    await call.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await shot(page, "03-call-focus.png");

  const reportsTab = page.getByRole("button", { name: /reports|reportes/i }).first();
  if (await reportsTab.count()) await reportsTab.click();
  try {
    await waitText(page, "Reported offenses|Reportes|87,|offenses", 20000);
  } catch {
    console.log("reports wait timed out");
  }
  await page.waitForTimeout(1500);
  await shot(page, "04-reports.png");

  const search = page.getByPlaceholder(/zip|street|offense|place/i).first();
  if (await search.count()) {
    await search.click();
    await search.fill("theft");
    await page.waitForTimeout(1400);
    await shot(page, "05-name-search.png");
    const hit = page.getByText(/theft|larceny/i).first();
    if (await hit.count()) await hit.click().catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, "06-search-hit.png");
    await search.fill("");
    await page.waitForTimeout(400);
  }

  const es = page.getByRole("button", { name: /^ES$/i }).first();
  if (await es.count()) {
    await es.click();
    await page.waitForTimeout(700);
    await shot(page, "07-spanish.png");
    const en = page.getByRole("button", { name: /^EN$/i }).first();
    if (await en.count()) await en.click();
    await page.waitForTimeout(400);
  }

  const share = page.getByRole("button", { name: /share|compart/i }).first();
  if (await share.count()) {
    await share.click().catch(() => {});
    await page.waitForTimeout(900);
  }
  await shot(page, "08-share.png");

  await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 30000 });
  try {
    await page.waitForSelector("#chica-atlas-home", { timeout: 8000 });
  } catch {
    console.log("atlas card wait timed out");
  }
  await page.waitForTimeout(1200);
  await shot(page, "09-chicas-home.png");

  await page.goto(ATLAS, { waitUntil: "domcontentloaded", timeout: 30000 });
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById("atlas-total");
        return el && /\d/.test(el.textContent || "");
      },
      { timeout: 20000 },
    );
  } catch {
    console.log("atlas total wait timed out");
  }
  await page.waitForTimeout(1500);
  await shot(page, "10-atlas-page.png");
  const zips = page.locator("#atlas-zips");
  if (await zips.count()) await zips.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "11-atlas-zip.png");
  const reports = page.locator("#atlas-reports");
  if (await reports.count()) await reports.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot(page, "12-atlas-search.png");
} finally {
  await browser.close();
}
console.log("capture done");
