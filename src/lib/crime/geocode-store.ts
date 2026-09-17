import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Coord } from "./geocode.ts";

export type GeoCacheEntry = { pt: Coord | null; at: number };

const MAX_KEYS = 8_000;
const HIT_TTL_MS = 30 * 24 * 60 * 60_000;
const FAIL_TTL_MS = 12 * 60_000;

export function cachePath(): string {
  return join(process.cwd(), "data", "geocode-cache.json");
}

export function shouldKeep(entry: GeoCacheEntry, now = Date.now()): boolean {
  if (entry.pt) return now - entry.at < HIT_TTL_MS;
  return now - entry.at < FAIL_TTL_MS;
}

export function parseCacheFile(raw: string): Record<string, GeoCacheEntry> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, GeoCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key || typeof value !== "object" || !value) continue;
      const row = value as { pt?: { lat?: number; lng?: number } | null; at?: number };
      const at = Number(row.at);
      if (!Number.isFinite(at)) continue;
      const lat = row.pt ? Number(row.pt.lat) : NaN;
      const lng = row.pt ? Number(row.pt.lng) : NaN;
      const pt =
        row.pt && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      const entry = { pt, at };
      if (!shouldKeep(entry)) continue;
      out[key] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

export function pruneCache(
  map: Map<string, GeoCacheEntry>,
  now = Date.now(),
): Record<string, GeoCacheEntry> {
  const rows = [...map.entries()]
    .filter(([, entry]) => shouldKeep(entry, now))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_KEYS);
  return Object.fromEntries(rows);
}

export function loadGeoCache(into: Map<string, GeoCacheEntry>): number {
  if (typeof window !== "undefined") return 0;
  try {
    const parsed = parseCacheFile(readFileSync(cachePath(), "utf8"));
    let n = 0;
    for (const [key, entry] of Object.entries(parsed)) {
      if (!into.has(key)) {
        into.set(key, entry);
        n += 1;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

export function saveGeoCache(map: Map<string, GeoCacheEntry>): void {
  if (typeof window !== "undefined") return;
  try {
    const file = cachePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(pruneCache(map))}\n`);
  } catch {
    /* preview / serverless fs may be read-only */
  }
}
