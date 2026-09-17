import assert from "node:assert/strict";
import test from "node:test";
import { addDaysYmd, arcgisDayToken, publicBlock } from "./daily.ts";

test("publicBlock floors house numbers to the hundred", () => {
  assert.equal(publicBlock("523 Dresden Dr"), "500 Dresden Dr");
  assert.equal(publicBlock("1100 N Frio St"), "1100 N Frio St");
  assert.equal(publicBlock("500 Dresden Dr"), "500 Dresden Dr");
});

test("publicBlock strips units and ZIP+4", () => {
  assert.equal(publicBlock("7100 Nw Loop 410 78238-4116"), "7100 Nw Loop 410");
  assert.equal(publicBlock("200 Main St Apt 4B"), "200 Main St");
  assert.equal(publicBlock("200 Main St Unit 12"), "200 Main St");
  assert.equal(publicBlock("200 Main St #3"), "200 Main St");
});

test("publicBlock keeps intersections without inventing a house number", () => {
  assert.equal(publicBlock("Wildhorse Pkwy / Dublin Spg"), "Wildhorse Pkwy / Dublin Spg");
  assert.equal(publicBlock("Wurzbach Pkwy Wb / Wetmore Rd"), "Wurzbach Pkwy Wb / Wetmore Rd");
});

test("arcgis day token matches the 7-day board", () => {
  assert.equal(arcgisDayToken("2026-09-16"), "09/16/26");
  assert.equal(addDaysYmd("2026-09-01", -1), "2026-08-31");
});
