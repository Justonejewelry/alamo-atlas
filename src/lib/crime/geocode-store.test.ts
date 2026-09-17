import assert from "node:assert/strict";
import test from "node:test";
import { parseCacheFile, pruneCache, shouldKeep } from "./geocode-store.ts";

test("parseCacheFile keeps valid hits and drops junk", () => {
  const now = Date.now();
  const parsed = parseCacheFile(
    JSON.stringify({
      "500 MAIN ST|78205": { pt: { lat: 29.4241, lng: -98.4936 }, at: now },
      bad: { pt: { lat: "x" }, at: now },
      empty: null,
    }),
  );
  assert.equal(parsed["500 MAIN ST|78205"]?.pt?.lat, 29.4241);
  assert.equal(parsed.bad, undefined);
});

test("shouldKeep expires misses faster than hits", () => {
  const now = 1_000_000;
  assert.equal(shouldKeep({ pt: null, at: now - 11 * 60_000 }, now), true);
  assert.equal(shouldKeep({ pt: null, at: now - 13 * 60_000 }, now), false);
  assert.equal(shouldKeep({ pt: { lat: 29.4, lng: -98.5 }, at: now - 2 * 24 * 3600_000 }, now), true);
});

test("pruneCache drops stale keys", () => {
  const now = Date.now();
  const map = new Map([
    ["keep", { pt: { lat: 29.4, lng: -98.5 }, at: now }],
    ["gone", { pt: null, at: now - 20 * 60_000 }],
  ]);
  const pruned = pruneCache(map, now);
  assert.ok(pruned.keep);
  assert.equal(pruned.gone, undefined);
});
