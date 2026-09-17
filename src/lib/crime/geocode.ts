import type { LiveCall } from "./cad-parse";
import { ATLAS_UA } from "./feeds";
import { loadGeoCache, saveGeoCache, type GeoCacheEntry } from "./geocode-store";

export type Coord = { lat: number; lng: number };

const cache = new Map<string, GeoCacheEntry>();
const FAIL_TTL_MS = 12 * 60_000;
const CITY = "SAN ANTONIO, TX";
const BEXAR_EXTENT = "-98.90,29.08,-98.05,29.78";
const SA_CENTER = "-98.4936,29.4241";

let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const STREET_TYPE =
  /\b(ST|STREET|DR|DRIVE|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|LN|LANE|PKWY|PARKWAY|HWY|HIGHWAY|CIR|CIRCLE|CT|COURT|WAY|TRL|TRAIL|PL|PLACE|LOOP|FWY|EXPY|EXPRESSWAY|PASS|PATH|ROW|TER|TERRACE|CV|COVE|PT|POINT|RUN|XING|CROSSING|ACCESS)\b/i;

const GOOD_ARCGIS = new Set([
  "PointAddress",
  "StreetAddress",
  "StreetAddressExt",
  "StreetInt",
  "Subaddress",
  "DistanceMarker",
]);

export function addressKey(address: string, zip: string): string {
  return `${address.toUpperCase().replace(/\s+/g, " ").trim()}|${zip}`;
}

export function streetOf(address: string): string {
  return address.replace(/^\d+\s+/, "").replace(/\s+\d{5}\s*$/, "").trim();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  loadGeoCache(cache);
}

function schedulePersist() {
  if (typeof window !== "undefined") return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    saveGeoCache(cache);
  }, 1_500);
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function withCity(line: string, zip: string): string {
  const core = tidy(line.replace(new RegExp(`,?\\s*${CITY}.*$`, "i"), ""));
  return tidy(`${core}, ${CITY}${zip ? ` ${zip}` : ""}`);
}

/** Turn a CAD location into Census/ArcGIS queries, best first. */
export function geocodeQueries(address: string, zip: string, crossStreet?: string): string[] {
  const raw = tidy(address);
  if (!raw) return [];
  const z = zip.replace(/\D/g, "").slice(0, 5);
  const out: string[] = [];
  const push = (line: string) => {
    const q = withCity(line, z);
    if (q && !out.some((x) => x.toUpperCase() === q.toUpperCase())) out.push(q);
  };

  let s = raw;
  s = s.replace(/\b(\d{3,6})\s*[-\u2013]\s*(\d{3,6})\b/, (_, a, b) =>
    String(Math.round((Number(a) + Number(b)) / 2)),
  );
  s = s.replace(/\b(\d+)\s+(?:BLK|BLOCK(?:\s+OF)?)\s+/i, "$1 ");
  s = s.replace(/\s+\b(NB|SB|EB|WB|NORTHBOUND|SOUTHBOUND|EASTBOUND|WESTBOUND)\b/gi, "");
  s = s.replace(/\b(ACCESS|FRONTAGE|SVC|SERVICE)\s+RD\b/gi, "");
  s = s.replace(/\bS0\b/g, "");
  s = s.replace(/\bLP\s*(410|1604)\b/gi, "LOOP $1");
  s = s.replace(/\b(ONRP|OFRP|ON[\s-]?RAMP|OFF[\s-]?RAMP)\b/gi, " & ");
  s = s.replace(/\s+\/\s+/g, " & ");
  s = s.replace(/\s+AND\s+/gi, " & ");
  s = s.replace(/\s+&\s+&\s+/g, " & ");
  s = tidy(s);

  let aliased = s;
  aliased = aliased.replace(/\bUS\s*HWY\s*/gi, "US HIGHWAY ");
  aliased = aliased.replace(/\bST(?:ATE)?\s*HWY\s*/gi, "STATE HIGHWAY ");
  aliased = aliased.replace(/\bIH\s*-?\s*/gi, "INTERSTATE ");
  aliased = aliased.replace(/\bI-\s*/gi, "INTERSTATE ");
  aliased = aliased.replace(/\bLOOP\s*410\b/gi, "INTERSTATE 410");
  aliased = aliased.replace(/\bLOOP\s*1604\b/gi, "STATE LOOP 1604");
  aliased = aliased.replace(/\bNW\s+MILITARY\s+(HWY|HIGHWAY)\b/gi, "NORTHWEST MILITARY HIGHWAY");
  aliased = aliased.replace(/\bSE\s+MILITARY\s+(HWY|HIGHWAY|DR)\b/gi, "SOUTHEAST MILITARY DRIVE");
  aliased = aliased.replace(/\bCESAR\s+CHAVEZ\b/gi, "CESAR E CHAVEZ");
  aliased = aliased.replace(/\bHISTORIC\s+OLD\s+(HWY|HIGHWAY)\b/gi, "OLD HIGHWAY");
  aliased = aliased.replace(/\bOLD\s+HWY\b/gi, "OLD HIGHWAY");
  aliased = aliased.replace(/\bPKWY\b/gi, "PARKWAY");
  aliased = aliased.replace(
    /\b((?:US\s+)?(?:HIGHWAY|HWY|INTERSTATE)\s+\d+)\s+([NESW])\b/i,
    "$2 $1",
  );
  aliased = tidy(aliased);

  push(aliased);
  if (aliased.toUpperCase() !== s.toUpperCase()) push(s);
  if (raw.toUpperCase() !== s.toUpperCase() && raw.toUpperCase() !== aliased.toUpperCase()) push(raw);

  if (
    /^\d/.test(aliased) &&
    !/&/.test(aliased) &&
    !STREET_TYPE.test(aliased) &&
    !/\b(INTERSTATE|HIGHWAY|HWY|US\s|FM\s|IH|I-)\b/i.test(aliased)
  ) {
    for (const suffix of ["DR", "ST", "RD", "AVE"]) push(`${aliased} ${suffix}`);
  }

  const cross = tidy(crossStreet ?? "");
  if (cross && !/&/.test(aliased)) {
    const street = streetOf(aliased) || aliased;
    push(`${street} & ${cross}`);
  }

  return out.slice(0, 4);
}

function inCounty(lat: number, lng: number): boolean {
  return lat >= 29.08 && lat <= 29.78 && lng >= -98.9 && lng <= -98.05;
}

function acceptCoord(lat: number, lng: number): Coord | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!inCounty(lat, lng)) return null;
  return { lat, lng };
}

async function censusLine(line: string, ms: number): Promise<Coord | null> {
  const params = new URLSearchParams({
    address: line,
    benchmark: "Public_AR_Current",
    format: "json",
  });
  const res = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, {
    headers: { "user-agent": ATLAS_UA, accept: "application/json" },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    result?: { addressMatches?: Array<{ coordinates?: { x?: number; y?: number } }> };
  };
  const match = json.result?.addressMatches?.[0]?.coordinates;
  return acceptCoord(Number(match?.y), Number(match?.x));
}

async function arcgisLine(line: string, zip: string, ms: number): Promise<Coord | null> {
  const params = new URLSearchParams({
    f: "json",
    SingleLine: line,
    maxLocations: "1",
    outFields: "Match_addr,Addr_type,Score,Postal,City",
    sourceCountry: "USA",
    forStorage: "false",
    outSR: "4326",
    location: SA_CENTER,
    searchExtent: BEXAR_EXTENT,
    inSR: "4326",
  });
  const res = await fetch(
    `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`,
    {
      headers: { "user-agent": ATLAS_UA, accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: Array<{
      address?: string;
      score?: number;
      location?: { x?: number; y?: number };
      attributes?: { Addr_type?: string; Postal?: string; Score?: number };
    }>;
  };
  const cand = json.candidates?.[0];
  if (!cand) return null;
  const score = Number(cand.score ?? cand.attributes?.Score ?? 0);
  const type = cand.attributes?.Addr_type ?? "";
  const postal = String(cand.attributes?.Postal ?? "").replace(/\D/g, "").slice(0, 5);
  const pt = acceptCoord(Number(cand.location?.y), Number(cand.location?.x));
  if (!pt) return null;
  if (type === "Postal" || type === "Locality" || type === "PostalExt") return null;
  if (GOOD_ARCGIS.has(type) && score >= 88) {
    if (!zip || !postal || postal === zip || score >= 96) return pt;
    return null;
  }
  if ((type === "POI" || type === "StreetName" || type === "BuildingName") && score >= 90 && postal && postal === zip) {
    return pt;
  }
  return null;
}

async function geocodeOne(
  address: string,
  zip: string,
  crossStreet: string | undefined,
  until: number,
): Promise<Coord | null> {
  if (!zip && /^\d+\s+.*(HWY|HIGHWAY|LOOP|IH|I-|US\s)/i.test(address)) return null;
  const queries = geocodeQueries(address, zip, crossStreet);
  if (!queries.length) return null;

  const remain = () => until - Date.now();
  if (remain() < 800) return null;

  try {
    const pt = await censusLine(queries[0]!, Math.min(4500, remain()));
    if (pt) return pt;
  } catch {
    /* try next */
  }

  if (remain() < 800) return null;
  try {
    const pt = await arcgisLine(queries[0]!, zip, Math.min(4500, remain()));
    if (pt) return pt;
  } catch {
    /* try second query */
  }

  const second = queries[1];
  if (second && remain() > 1200) {
    try {
      const pt = await arcgisLine(second, zip, Math.min(4000, remain()));
      if (pt) return pt;
    } catch {
      return null;
    }
  }
  return null;
}

export async function attachCoords(calls: LiveCall[], budgetMs = 12_000): Promise<LiveCall[]> {
  hydrate();
  const deadline = Date.now() + budgetMs;
  const pending: Array<{ key: string; address: string; zip: string; crossStreet?: string }> = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (const c of calls) {
    if (!c.address) continue;
    const key = addressKey(c.address, c.zip);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = cache.get(key);
    if (hit && (hit.pt || now - hit.at < FAIL_TTL_MS)) continue;
    pending.push({ key, address: c.address, zip: c.zip, crossStreet: c.crossStreet });
  }

  let wrote = false;
  let cursor = 0;
  const workers = Array.from({ length: 5 }, async () => {
    while (cursor < pending.length && Date.now() < deadline) {
      const job = pending[cursor++];
      if (!job) break;
      try {
        const started = Date.now();
        const pt = await geocodeOne(job.address, job.zip, job.crossStreet, Math.min(deadline, Date.now() + 9_000));
        if (pt || Date.now() - started > 700) {
          cache.set(job.key, { pt, at: Date.now() });
          wrote = true;
        }
      } catch {
        /* leave uncached so the next poll retries */
      }
    }
  });
  await Promise.all(workers);
  if (wrote) schedulePersist();

  return calls.map((c) => {
    const street = streetOf(c.address);
    const pt = c.address ? cache.get(addressKey(c.address, c.zip))?.pt : null;
    if (pt) return { ...c, street, lat: pt.lat, lng: pt.lng, geo: "block" as const };
    return { ...c, street, geo: c.geo ?? "none" };
  });
}
