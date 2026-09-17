import assert from "node:assert/strict";
import test from "node:test";
import { geocodeQueries } from "./geocode.ts";

test("turns slash intersections into & for the geocoder", () => {
  const q = geocodeQueries("Hillcrest Dr / Willowbrook Dr", "78228");
  assert.ok(q.some((x) => /HILLCREST DR & WILLOWBROOK DR/i.test(x)));
});

test("strips BLK and BLOCK OF", () => {
  const q = geocodeQueries("100 BLK RIVER WALK", "78215");
  assert.match(q[0] ?? "", /^100 RIVER WALK,/i);
});

test("uses the midpoint of a published range and drops bound letters", () => {
  const q = geocodeQueries("10612-10898 US HWY 90 W EB", "78245");
  assert.match(q[0] ?? "", /10755 W US HIGHWAY 90/i);
  assert.ok(!/\bEB\b/.test(q[0] ?? ""));
});

test("aliases Loop 1604 and Cesar Chavez", () => {
  const loop = geocodeQueries("10200 W LOOP 1604 N", "78254");
  assert.ok(loop.some((x) => /STATE LOOP 1604/i.test(x)));
  const cesar = geocodeQueries("400 W CESAR CHAVEZ BLVD", "78204");
  assert.ok(cesar.some((x) => /CESAR E CHAVEZ/i.test(x)));
});

test("adds a cross street when the CAD line is not already an intersection", () => {
  const q = geocodeQueries("1700 Sw Loop 410", "78227", "WESTPOND DR");
  assert.ok(q.some((x) => /&\s*WESTPOND DR/i.test(x)));
});

test("guesses a street type when SAPD omitted it", () => {
  const q = geocodeQueries("2100 LEYTE", "78217");
  assert.ok(q.some((x) => /2100 LEYTE DR/i.test(x)));
});

test("does not invent a street type for a highway", () => {
  const q = geocodeQueries("1700 Sw Loop 410", "78227");
  assert.ok(!q.some((x) => /INTERSTATE 410 DR/i.test(x)));
});

test("turns an on-ramp CAD line into the highway interchange", () => {
  const q = geocodeQueries("S0 LP 410 ONRP WB US HWY 90", "78227");
  assert.match(q[0] ?? "", /INTERSTATE 410 & US HIGHWAY 90/i);
});

