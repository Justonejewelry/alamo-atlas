import assert from "node:assert/strict";
import test from "node:test";
import { isTrafficCall, nearestCamera } from "./transguide.ts";
import { callFingerprint, diffFollowedCalls } from "./follow.ts";

test("flags crashes and highway MVCs as traffic", () => {
  assert.equal(isTrafficCall({ problem: "Major Accident", address: "6000 NW LOOP 410", street: "NW LOOP 410" }), true);
  assert.equal(isTrafficCall({ problem: "MVC-FIRE ONLY", address: "IH 10 at Frio", street: "IH 10" }), true);
  assert.equal(isTrafficCall({ problem: "Traffic Related", address: "500 MAIN", street: "MAIN" }), true);
});

test("does not treat a welfare check as traffic even on a loop", () => {
  assert.equal(
    isTrafficCall({ problem: "Welfare Check", address: "6000 NW LOOP 410", street: "NW LOOP 410" }),
    false,
  );
  assert.equal(isTrafficCall({ problem: "Disturbance", address: "200 FLORES", street: "FLORES" }), false);
  assert.equal(isTrafficCall({ problem: "Officer Traffic Stop", address: "800 W HOUSTON ST", street: "HOUSTON" }), false);
  assert.equal(isTrafficCall({ problem: "Suspicious Vehicle", address: "N LOOP 1604 E / FM 2252", street: "LOOP 1604" }), false);
});

test("picks the nearest TransGuide camera inside the mile cap", () => {
  const cams = [
    { id: "far", name: "far", roadway: "IH-10", lat: 29.6, lng: -98.7 },
    { id: "near", name: "IH 10 at Frio", roadway: "IH-10", lat: 29.424, lng: -98.505 },
  ];
  const hit = nearestCamera(29.425, -98.504, cams, 0.85);
  assert.equal(hit?.id, "near");
  assert.ok((hit?.miles ?? 9) < 0.2);
  assert.equal(hit?.lat, 29.424);
  assert.equal(nearestCamera(29.2, -98.8, cams, 0.85), null);
});

test("follow diff reports updates and board-cleared", () => {
  const call = {
    id: "SAPD-1",
    problem: "Crash",
    address: "100 IH 10",
    zip: "78205",
    street: "IH 10",
    when: "",
    whenMs: 1,
    division: "",
    severity: "medium" as const,
    agency: "police" as const,
    units: 2,
  };
  const followed = [
    {
      id: "SAPD-1",
      kind: "call",
      fingerprint: callFingerprint(call),
      title: "Crash",
      subtitle: "100 IH 10",
      status: "open",
    },
    {
      id: "SAPD-2",
      kind: "call",
      fingerprint: "x",
      title: "MVC",
      subtitle: "410",
      status: "open",
    },
  ];
  const updated = { ...call, units: 5, txdot: { id: "t", summary: "Lane 2 blocked" }, camera: { id: "c1", name: "IH 10 at Frio", roadway: "IH-10", miles: 0.2 } };
  const diffs = diffFollowedCalls(followed, [updated]);
  assert.equal(diffs.length, 2);
  assert.equal(diffs.find((d) => d.id === "SAPD-1")?.kind, "update");
  assert.equal(diffs.find((d) => d.id === "SAPD-2")?.kind, "cleared");
});

test("follow fingerprint changes when a TransGuide camera attaches", () => {
  const base = {
    problem: "Traffic Related",
    address: "5200 IH 10 W NB",
    zip: "78201",
    units: 2,
    tac: "",
  };
  const before = callFingerprint(base);
  const after = callFingerprint({
    ...base,
    camera: { id: "IH 10 at West Ave", name: "IH 10 at West Ave", roadway: "IH-10", miles: 0.1 },
  });
  assert.notEqual(before, after);
});
