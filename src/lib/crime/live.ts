import { createServerFn } from "@tanstack/react-start";
import { attachCoords } from "./geocode";
import { decorateTraffic } from "./transguide";
import {
  backoffMs,
  hidden,
  mergeBoards,
  parsePolice,
  parseSafd,
  parseSafd72,
  parseTacc,
  pruneHistory,
  type CallAgency,
  type CallSeverity,
  type GeoQuality,
  type LiveCall,
  type LiveWindow,
} from "./cad-parse";

export type { CallAgency, CallSeverity, GeoQuality, LiveCall, LiveWindow };
export { withinLiveWindow } from "./cad-parse";

const CAD_URL = "https://webapp3.sanantonio.gov/policecalls/Calls.aspx";
const FIRE_URL = "https://webapp3.sanantonio.gov/activefire/Fire.aspx";
const EMS_URL = "https://webapp3.sanantonio.gov/activefire/EMS.aspx";
const FIRE_72_URL = "https://webapp3.sanantonio.gov/activefire/SAFDDisplay.aspx";
const NWS_ZONE = "https://api.weather.gov/alerts/active?zone=TXC029";
const TTL_MS = 30_000;
const UA = "AlamoAtlas/1.0 (San Antonio public-safety map)";

let cache: { at: number; value: LiveFeed } | null = null;
let lastGood: LiveFeed | null = null;
const historyRing = new Map<string, LiveCall>();

export type WeatherAlert = {
  id: string;
  event: string;
  headline: string;
  severity: string;
};

export type LiveFeed = {
  fetchedAt: string;
  sourceUpdated: string | null;
  calls: LiveCall[];
  history: LiveCall[];
  weather: WeatherAlert[];
  error: string | null;
  stale: boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withBackoff<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < tries - 1) await sleep(backoffMs(i));
    }
  }
  throw last;
}

async function cadPage(url: string, init?: { body?: string }): Promise<string> {
  return withBackoff(async () => {
    const res = await fetch(url, {
      method: init?.body ? "POST" : "GET",
      headers: {
        "user-agent": UA,
        accept: "text/html",
        ...(init?.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init?.body,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.text();
  });
}

async function fetchPolice(): Promise<{ calls: LiveCall[]; sourceUpdated: string | null }> {
  const first = await cadPage(CAD_URL);
  const calls = parsePolice(first);
  const sourceUpdated = /id="lblLastUpdate">([^<]+)</i.exec(first)?.[1]?.trim() ?? null;
  const pageNs = [...first.matchAll(/Page\$(\d+)/g)].map((m) => Number(m[1]));
  const maxPage = pageNs.length ? Math.max(...pageNs) : 1;
  if (maxPage <= 1) return { calls, sourceUpdated };

  const vs = hidden(first, "__VIEWSTATE");
  const ev = hidden(first, "__EVENTVALIDATION");
  const vg = hidden(first, "__VIEWSTATEGENERATOR");
  const pages = await Promise.all(
    Array.from({ length: maxPage - 1 }, (_, i) => i + 2).map(async (n) => {
      const body = new URLSearchParams({
        __EVENTTARGET: "gvCalls",
        __EVENTARGUMENT: `Page$${n}`,
        __VIEWSTATE: vs,
        __VIEWSTATEGENERATOR: vg,
        __EVENTVALIDATION: ev,
      }).toString();
      try {
        return parsePolice(await cadPage(CAD_URL, { body }));
      } catch {
        return [] as LiveCall[];
      }
    }),
  );
  const seen = new Set(calls.map((c) => c.id));
  for (const list of pages) {
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      calls.push(c);
    }
  }
  return { calls, sourceUpdated };
}

async function fetchTaccHistory(): Promise<LiveCall[]> {
  const now = new Date();
  const days: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`https://smartcity.tacc.utexas.edu/fire/api/v1/SanAntonio/${y}/${m}/${day}/FireMap.json`);
  }
  const lists = await Promise.all(
    days.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "user-agent": UA, accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return [] as LiveCall[];
        return parseTacc(await res.json());
      } catch {
        return [] as LiveCall[];
      }
    }),
  );
  return lists.flat();
}

async function fetchWeather(lat?: number, lng?: number): Promise<WeatherAlert[]> {
  const url =
    lat != null && lng != null
      ? `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`
      : NWS_ZONE;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/geo+json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: Array<{ id?: string; properties?: Record<string, string> }>;
    };
    return (json.features ?? []).slice(0, 8).map((f) => ({
      id: String(f.id ?? f.properties?.id ?? f.properties?.headline ?? Math.random()),
      event: f.properties?.event ?? "Alert",
      headline: f.properties?.headline ?? f.properties?.event ?? "Weather alert",
      severity: f.properties?.severity ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

function rememberHistory(calls: LiveCall[]) {
  for (const c of calls) {
    if (c.agency === "fire" || c.agency === "ems") historyRing.set(c.id, c);
  }
  const cut = Date.now() - 72 * 3600 * 1000;
  for (const [id, c] of historyRing) {
    if (c.whenMs < cut) historyRing.delete(id);
  }
}

export async function loadLiveFeed(lat?: number, lng?: number): Promise<LiveFeed> {
  const [police, fire, ems, official72, tacc, weather] = await Promise.allSettled([
    fetchPolice(),
    cadPage(FIRE_URL).then((html) => parseSafd(html, "fire")),
    cadPage(EMS_URL).then((html) => parseSafd(html, "ems")),
    cadPage(FIRE_72_URL).then(parseSafd72),
    fetchTaccHistory(),
    fetchWeather(lat, lng),
  ]);
  const policeOk = police.status === "fulfilled" ? police.value.calls : [];
  const fireOk = fire.status === "fulfilled" ? fire.value : [];
  const emsOk = ems.status === "fulfilled" ? ems.value : [];
  const sourceUpdated = police.status === "fulfilled" ? police.value.sourceUpdated : null;
  const weatherOk = weather.status === "fulfilled" ? weather.value : [];
  const raw = mergeBoards(policeOk, fireOk, emsOk);
  rememberHistory([...raw, ...(tacc.status === "fulfilled" ? tacc.value : [])]);
  if (official72.status === "fulfilled" && !official72.value.unavailable) {
    rememberHistory(official72.value.calls);
  }
  let calls = raw;
  let history = pruneHistory([...historyRing.values()]);
  try {
    const combined = await attachCoords([...raw, ...history], 12_000);
    const keyed = new Map(combined.map((c) => [c.id, c]));
    calls = raw.map((c) => keyed.get(c.id) ?? c);
    history = history.map((c) => keyed.get(c.id) ?? c);
    for (const c of calls) {
      if (c.lat != null && (c.agency === "fire" || c.agency === "ems")) historyRing.set(c.id, c);
    }
    try {
      calls = await decorateTraffic(calls);
    } catch {
      /* TransGuide stills are optional — CAD still ships. */
    }
  } catch {
    calls = raw;
  }
  const misses = [
    police.status === "rejected" ? "SAPD police board" : null,
    fire.status === "rejected" ? "SAFD fire board" : null,
    ems.status === "rejected" ? "SAFD EMS board" : null,
  ].filter(Boolean);
  if (raw.length === 0 && lastGood?.calls.length) {
    return {
      ...lastGood,
      fetchedAt: new Date().toISOString(),
      history,
      stale: true,
      error: `Live boards timed out. Showing last good snapshot. ${misses.join(", ")}`.trim(),
    };
  }
  const value: LiveFeed = {
    fetchedAt: new Date().toISOString(),
    sourceUpdated,
    calls,
    history,
    weather: weatherOk,
    error: misses.length && raw.length === 0 ? `Could not reach ${misses.join(", ")}.` : null,
    stale: false,
  };
  lastGood = value;
  return value;
}

export function isLiveFeed(v: unknown): v is LiveFeed {
  if (!v || typeof v !== "object") return false;
  const o = v as LiveFeed;
  return Array.isArray(o.calls) && Array.isArray(o.history);
}

function emptyFeed(error: string): LiveFeed {
  return {
    fetchedAt: new Date().toISOString(),
    sourceUpdated: null,
    calls: [],
    history: lastGood?.history ?? [],
    weather: [],
    error,
    stale: true,
  };
}

export async function loadLiveFeedCached(lat?: number, lng?: number): Promise<LiveFeed> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const value = await loadLiveFeed(lat, lng);
    cache = { at: Date.now(), value };
    return value;
  } catch {
    if (lastGood) {
      return {
        ...lastGood,
        fetchedAt: new Date().toISOString(),
        stale: true,
        error: "Live boards timed out. Showing last good snapshot.",
      };
    }
    return emptyFeed("Could not reach the SAPD and SAFD live boards.");
  }
}

export const getLiveDispatch = createServerFn({ method: "POST" })
  .validator((input: { lat?: number; lng?: number }) => {
    const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : undefined;
    const lng = typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : undefined;
    return { lat, lng };
  })
  .handler(async ({ data }): Promise<LiveFeed> => {
    return loadLiveFeedCached(data.lat, data.lng);
  });
