import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { cachedAlmanac, clearAlmanacMemory, peekAlmanacMemory } from "./almanac-cache.ts";

describe("almanac memory cache", () => {
  beforeEach(() => {
    clearAlmanacMemory();
  });

  it("returns the loader result and remembers it", async () => {
    let n = 0;
    const first = await cachedAlmanac({
      key: "test:one",
      ttlMs: 60_000,
      source: "unit",
      load: async () => {
        n += 1;
        return { n };
      },
    });
    const second = await cachedAlmanac({
      key: "test:one",
      ttlMs: 60_000,
      source: "unit",
      load: async () => {
        n += 1;
        return { n };
      },
    });
    assert.equal(first.n, 1);
    assert.equal(second.n, 1);
    assert.equal(n, 1);
    assert.deepEqual(peekAlmanacMemory("test:one"), { n: 1 });
  });

  it("rejects stale memory when validate fails", async () => {
    await cachedAlmanac({
      key: "test:bad",
      ttlMs: 60_000,
      source: "unit",
      load: async () => ({ ok: false }),
    });
    const next = await cachedAlmanac({
      key: "test:bad",
      ttlMs: 60_000,
      source: "unit",
      validate: (v): v is { ok: true } =>
        Boolean(v && typeof v === "object" && (v as { ok?: unknown }).ok === true),
      load: async () => ({ ok: true as const }),
    });
    assert.deepEqual(next, { ok: true });
  });
});
