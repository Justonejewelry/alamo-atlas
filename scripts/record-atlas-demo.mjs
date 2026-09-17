#!/usr/bin/env node
/**
 * Drive Alamo Atlas + Chicas Map Atlas, capture real screenshots,
 * and record a silent screen video of the interactions.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const SHOT = "/workspace/screenshots/demo";
const VID = "/workspace/artifacts/demo-raw";
mkdirSync(SHOT, { recursive: true });
mkdirSync(VID, { recursive: true });

const APP = process.env.DEMO_URL || "http://127.0.0.1:8080/";
const ATLAS = "https://justonejewelry.github.io/Chicas-Map/atlas/";
const HOME = "https://justonejewelry.github.io/Chicas-Map/";

async function shot(page, name) {
  const path = `${SHOT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("shot", path);
}

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function clickText(page, re) {
  const loc = page.getByRole("button", { name: re }).first();
  if (await loc.count()) {
    await loc.click({ timeout: 4000 }).catch(() => {});
    return true;
  }
  const any = page.getByText(re).first();
  if (await any.count()) {
    await any.click({ timeout: 4000 }).catch(() => {});
    return true;
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
  recordVideo: { dir: VID, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
page.setDefaultTimeout(8000);

await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 60000 });
await pause(page, 2500);
await page.waitForFunction(
  () => document.body && document.body.innerText.length > 80,
  { timeout: 20000 },
).catch(() => {});
await pause(page, 3500);
await shot(page, "01-live-map");

await clickText(page, /live/i);
await pause(page, 1200);
await shot(page, "02-live-board");

const call = page.locator("button, article, li").filter({ hasText: /on scene|priority|dispatch|call/i }).first();
if (await call.count()) {
  await call.click({ timeout: 3000 }).catch(() => {});
  await pause(page, 1400);
}
await shot(page, "03-call-focus");

await clickText(page, /reports/i);
await pause(page, 2500);
await shot(page, "04-reports");

const search = page.locator('input[placeholder*="ZIP"], input[placeholder*="street"], input[type="search"], input[placeholder*="offense"]').first();
if (await search.count()) {
  await search.click();
  await search.fill("");
  await search.type("theft", { delay: 90 });
  await pause(page, 1600);
  await shot(page, "05-name-search");
  const hit = page.getByText(/theft|larceny/i).first();
  if (await hit.count()) await hit.click({ timeout: 2500 }).catch(() => {});
  await pause(page, 1200);
  await shot(page, "06-search-hit");
} else {
  await shot(page, "05-name-search");
  await shot(page, "06-search-hit");
}

await clickText(page, /^ES$/);
await pause(page, 900);
await shot(page, "07-spanish");
await clickText(page, /^EN$/);
await pause(page, 400);

const share = page.getByRole("button", { name: /share/i }).first();
if (await share.count()) {
  await share.click({ timeout: 3000 }).catch(() => {});
  await pause(page, 1200);
}
await shot(page, "08-share");

await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
await pause(page, 2500);
await shot(page, "09-chicas-home");

await page.goto(ATLAS, { waitUntil: "domcontentloaded", timeout: 45000 });
await pause(page, 4000);
await shot(page, "10-atlas-page");
const zipBtn = page.locator("button.atlas-zip").first();
if (await zipBtn.count()) {
  await zipBtn.click({ timeout: 3000 }).catch(() => {});
  await pause(page, 1800);
}
await shot(page, "11-atlas-zip");

const atlasSearch = page.locator("#atlas-q");
if (await atlasSearch.count()) {
  await atlasSearch.fill("assault");
  await page.locator('#atlas-search button[type="submit"]').click().catch(() => {});
  await pause(page, 2000);
}
await shot(page, "12-atlas-search");

await context.close();
await browser.close();
console.log("video dir", VID);
