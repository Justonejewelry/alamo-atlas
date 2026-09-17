import assert from "node:assert/strict";
import test from "node:test";
import { FEED_LIST, FEEDS, feedById, feedsForRole } from "./feeds.ts";

test("feed ids are unique", () => {
  const ids = FEED_LIST.map((f) => f.id);
  assert.equal(ids.length, new Set(ids).size);
});

test("every live feed has ttl and timeout", () => {
  for (const f of feedsForRole("live")) {
    assert.ok(f.ttlMs > 0, f.id);
    assert.ok(f.timeoutMs > 0, f.id);
    assert.ok(f.url.startsWith("https://"), f.id);
    assert.ok(f.honesty.length > 0, f.id);
  }
});

test("ArcGIS 7-day is the live police primary", () => {
  assert.equal(FEEDS.sapdCfs7d.kind, "arcgis");
  assert.match(FEEDS.sapdCfs7d.url, /CFS_SAPD_7Days/);
  assert.equal(FEEDS.sapdCadHtml.kind, "html");
});

test("CKAN tables stay ZIP-only", () => {
  assert.equal(FEEDS.ckanCfs.geo, "zip");
  assert.equal(FEEDS.ckanOffenses.geo, "zip");
  assert.equal(FEEDS.ckanCfs.role, "demand");
  assert.equal(FEEDS.ckanOffenses.role, "reports");
});

test("feedById finds catalog rows", () => {
  assert.equal(feedById("sapd-cfs-7d")?.owner, "SAPD");
  assert.equal(feedById("missing"), undefined);
});
