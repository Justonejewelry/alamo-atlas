import assert from "node:assert/strict";
import test from "node:test";
import {
  digestCalls,
  mergeHistory,
  overnightCutoff,
  placeMatches,
  type LiveCall,
} from "./cad-parse.ts";

function call(partial: Partial<LiveCall> & Pick<LiveCall, "id" | "address" | "zip" | "whenMs">): LiveCall {
  return {
    when: "",
    problem: "Call",
    street: partial.street ?? partial.address.replace(/^\d+\s+/, ""),
    division: "",
    severity: "high",
    agency: "fire",
    ...partial,
  };
}

test("overnight cutoff is yesterday 6pm unless digest is newer", () => {
  const now = Date.parse("2026-09-15T14:00:00");
  const sixPm = Date.parse("2026-09-14T18:00:00");
  assert.equal(overnightCutoff(null, now), sixPm);
  const later = Date.parse("2026-09-15T08:00:00");
  assert.equal(overnightCutoff(later, now), later);
});

test("digest keeps watched buildings and ZIPs since cutoff", () => {
  const since = Date.parse("2026-09-14T18:00:00");
  const calls = [
    call({ id: "a", address: "100 MAIN", zip: "78205", whenMs: since + 1000, street: "MAIN" }),
    call({ id: "b", address: "200 OAK", zip: "78210", whenMs: since + 1000, street: "OAK" }),
    call({ id: "c", address: "100 MAIN", zip: "78205", whenMs: since - 1000, street: "MAIN" }),
  ];
  const hit = digestCalls(calls, [{ zip: "78205", address: "100 MAIN", street: "MAIN" }], since);
  assert.equal(hit.length, 1);
  assert.equal(hit[0]?.id, "a");
});

test("mergeHistory dedupes and drops >72h", () => {
  const now = Date.now();
  const a = call({ id: "x", address: "1 A", zip: "78201", whenMs: now - 1000 });
  const old = call({ id: "y", address: "2 B", zip: "78201", whenMs: now - 80 * 3600 * 1000 });
  const merged = mergeHistory([a, old], [a]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, "x");
});

test("placeMatches building vs zip", () => {
  const c = call({ id: "p", address: "400 SE LOOP 410", zip: "78220", whenMs: Date.now(), street: "SE LOOP 410" });
  assert.equal(placeMatches(c, { zip: "78220", address: "400 SE LOOP 410", street: "SE LOOP 410" }), true);
  assert.equal(placeMatches(c, { zip: "78205" }), false);
  assert.equal(placeMatches(c, { zip: "78220" }), true);
});
