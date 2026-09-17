import assert from "node:assert/strict";
import test from "node:test";
import {
  backoffMs,
  classifyProblem,
  mergeBoards,
  parsePolice,
  parseSafd,
  parseSafd72,
  parseTacc,
  pruneHistory,
  withinLiveWindow,
} from "./cad-parse.ts";

const POLICE = `
<table id="gvCalls">
<tr><td></td><td>SAPD-2026-1</td><td>9/15/2026 1:00:00 PM</td><td>Disturbance (Gun Involved)</td>
<td><a href="http://maps.google.com/maps?q=600 FLORIDA+78210">600 FLORIDA</a></td>
<td>EAST</td></tr>
</table>`;

const FIRE = `
<table id="GridView2">
<tr><th># of Units</th></tr>
<tr>
<td>3</td><td>9/15/2026 1:51:59 PM</td><td>VEHICLE FIRE</td>
<td><a href="http://maps.google.com/maps?q=400 Se Loop 410+78220">400 Se Loop 410</a></td>
<td>CROSS</td><td>Street</td><td>78220</td><td>*TAC8</td>
</tr>
</table>`;

const EMS = FIRE.replace("VEHICLE FIRE", "Medical Call").replace("SAFD-F", "x");

test("parses SAPD live rows", () => {
  const calls = parsePolice(POLICE);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.id, "SAPD-2026-1");
  assert.equal(calls[0]?.agency, "police");
  assert.equal(calls[0]?.zip, "78210");
  assert.equal(calls[0]?.severity, "high");
});

test("parses SAFD fire rows", () => {
  const calls = parseSafd(FIRE, "fire");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.agency, "fire");
  assert.equal(calls[0]?.zip, "78220");
  assert.equal(calls[0]?.units, 3);
  assert.match(calls[0]?.problem ?? "", /VEHICLE FIRE/);
});

test("parses SAFD EMS rows", () => {
  const calls = parseSafd(EMS, "ems");
  assert.equal(calls[0]?.agency, "ems");
  assert.equal(calls[0]?.severity, "medium");
});

test("72h page unavailable is not a crash", () => {
  const r = parseSafd72("<h4>Structure, Brush, and Hazmat Fires information is not available at this time.</h4>");
  assert.equal(r.unavailable, true);
  assert.equal(r.calls.length, 0);
});

test("parses TACC JSON fire history", () => {
  const calls = parseTacc({
    rss: {
      channel: {
        item: {
          title: "OTHER FIRE",
          description: "15600 Chase Hill Blvd | SAFD | 00:15:05",
          pubDate: "Tue, 15 Sep 2026 00:15:05 CDT",
        },
      },
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.address, "15600 Chase Hill Blvd");
  assert.equal(calls[0]?.agency, "fire");
});

test("merge drops EMS duplicates of fire addresses", () => {
  const fire = parseSafd(FIRE, "fire");
  const ems = parseSafd(FIRE.replace("VEHICLE FIRE", "Medical Call"), "ems");
  const merged = mergeBoards([], fire, ems);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.agency, "fire");
});

test("classify and backoff", () => {
  assert.equal(classifyProblem("Structure Fire"), "high");
  assert.equal(classifyProblem("Medical Call"), "medium");
  assert.equal(backoffMs(0), 400);
  assert.equal(backoffMs(1), 800);
});

test("prunes history older than 72h", () => {
  const now = Date.parse("2026-09-15T20:00:00-05:00");
  const old = { ...(parseSafd(FIRE, "fire")[0]!), whenMs: now - 80 * 3600 * 1000, id: "old" };
  const fresh = { ...(parseSafd(FIRE, "fire")[0]!), whenMs: now - 2 * 3600 * 1000 };
  assert.equal(pruneHistory([old, fresh], now).length, 1);
});

test("live window keeps recent on-scene calls", () => {
  const now = Date.parse("2026-09-16T00:40:00-05:00");
  assert.equal(withinLiveWindow(now - 10 * 60_000, "30m", now), true);
  assert.equal(withinLiveWindow(now - 50 * 60_000, "30m", now), false);
  assert.equal(withinLiveWindow(now - 50 * 60_000, "2h", now), true);
  assert.equal(withinLiveWindow(now - 3 * 3600_000, "2h", now), false);
  assert.equal(withinLiveWindow(now - 3 * 3600_000, "all", now), true);
});
