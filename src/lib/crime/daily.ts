import { classifyProblem, parseSaDate, parseTacc, streetOf, type LiveCall } from "./cad-parse.ts";
import { ARCGIS_CFS_7DAY, ATLAS_UA, FEEDS, TACC_FIRE_DAY } from "./feeds.ts";

const PAGE = 2000;
const TTL_MS = 10 * 60_000;
const TZ = "America/Chicago";

export type DailyFeed = {
  day: string;
  requestedDay: string;
  label: string;
  lagged: boolean;
  fetchedAt: string;
  source: string;
  total: number;
  calls: LiveCall[];
  byProblem: { name: string; n: number }[];
  byZip: { zip: string; n: number }[];
  police: number;
  fire: number;
  ems: number;
  error: string | null;
};

let cache: { key: string; at: number; value: DailyFeed } | null = null;

export function chicagoYmd(ms = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

export function previousChicagoDay(now = Date.now()): string {
  return addDaysYmd(chicagoYmd(now), -1);
}

export function arcgisDayToken(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${(y ?? "").slice(2)}`;
}

export function labelChicagoDay(ymd: string, locale: "en" | "es" = "en"): string {
  const dt = new Date(`${ymd}T12:00:00-05:00`);
  return dt.toLocaleDateString(locale === "es" ? "es-US" : "en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Hundred-block only. Strip units, ZIP+4, and rooftop-style house numbers. */
export function publicBlock(address: string): string {
  let s = address.replace(/\s+/g, " ").trim();
  s = s.replace(/,?\s*(SAN ANTONIO|TX)\.?\s*$/i, "");
  s = s.replace(/\b(?:APT|APARTMENT|UNIT|STE|SUITE|BLDG|BUILDING)\s*[A-Z0-9-]+\b|#\s*[A-Z0-9-]+\b/gi, "");
  s = s.replace(/\b\d{5}-\d{4}\b/g, "");
  s = s.replace(/\s+\d{5}\s*$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  const intersection = /(?:\s(?:\/|&)\s|^[^0-9].*\s(?:\/|&)\s)/.test(s) && !/^\d/.test(s);
  if (!intersection) {
    s = s.replace(/^(\d{1,6})\b/, (_, n: string) => String(Math.floor(Number(n) / 100) * 100));
  }
  return s.replace(/\s+/g, " ").trim();
}

function padZip(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 5);
}

type ArcgisAttrs = Record<string, unknown>;

function callFromArcgis(row: ArcgisAttrs): LiveCall | null {
  const id = String(row.IncidentNumber ?? "").trim();
  if (!id) return null;
  const problem = String(row.ProblemType ?? "Call").trim() || "Call";
  const zip = padZip(row.Zipcode);
  const address = publicBlock(String(row.Address ?? ""));
  const whenMs = Number(row.ResponseDate);
  const when = String(row.ResponseDateText ?? "").trim();
  return {
    id,
    when,
    whenMs: Number.isFinite(whenMs) && whenMs > 1_000_000_000_000 ? whenMs : parseSaDate(when),
    problem,
    asCalledIn: problem,
    address,
    street: streetOf(address),
    zip,
    division: String(row.Substation ?? "").trim(),
    severity: classifyProblem(problem),
    agency: "police",
    category: String(row.Category ?? "").trim() || undefined,
    geo: zip ? "zip" : "none",
  };
}

async function arcgisQuery(params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${ARCGIS_CFS_7DAY}?${new URLSearchParams({ ...params, f: "json" }).toString()}`;
  const res = await fetch(url, {
    headers: { "user-agent": ATLAS_UA, accept: "application/json" },
    signal: AbortSignal.timeout(FEEDS.sapdCfs7d.timeoutMs),
  });
  if (!res.ok) throw new Error(`SAPD 7-day board returned ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string } | undefined;
  if (err?.message) throw new Error(err.message);
  return json;
}

export async function loadArcgisDayCalls(ymd: string): Promise<LiveCall[]> {
  const token = arcgisDayToken(ymd);
  const where = `ResponseDateText LIKE '${token}%'`;
  const out: LiveCall[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let i = 0; i < 30; i++) {
    const json = await arcgisQuery({
      where,
      outFields: "IncidentNumber,ResponseDate,ResponseDateText,ProblemType,Address,Zipcode,Substation,Category",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      orderByFields: "OBJECTID",
    });
    const feats = (json.features as Array<{ attributes?: ArcgisAttrs }> | undefined) ?? [];
    for (const f of feats) {
      const call = callFromArcgis(f.attributes ?? {});
      if (!call || seen.has(call.id)) continue;
      seen.add(call.id);
      out.push(call);
    }
    const more = Boolean(json.exceededTransferLimit) || feats.length >= PAGE;
    if (!more) break;
    offset += feats.length;
    if (!feats.length) break;
  }
  return out;
}

async function latestArcgisDay(): Promise<string | null> {
  const json = await arcgisQuery({
    where: "1=1",
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: "ResponseDate", outStatisticFieldName: "max_d" },
    ]),
  });
  const feats = (json.features as Array<{ attributes?: { max_d?: number } }> | undefined) ?? [];
  const ms = feats[0]?.attributes?.max_d;
  if (!ms) return null;
  return chicagoYmd(ms);
}

async function fetchTaccDay(ymd: string): Promise<LiveCall[]> {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return [];
  try {
    const res = await fetch(TACC_FIRE_DAY(y, m, d), {
      headers: { "user-agent": ATLAS_UA, accept: "application/json" },
      signal: AbortSignal.timeout(FEEDS.taccFire.timeoutMs),
    });
    if (!res.ok) return [];
    const calls = parseTacc(await res.json());
    return calls
      .filter((c) => chicagoYmd(c.whenMs) === ymd)
      .map((c) => {
        const address = publicBlock(c.address);
        return {
          ...c,
          address,
          street: streetOf(address),
          asCalledIn: c.problem,
          geo: c.zip ? ("zip" as const) : ("none" as const),
          lat: undefined,
          lng: undefined,
        };
      });
  } catch {
    return [];
  }
}

function tally(calls: LiveCall[]): Pick<DailyFeed, "byProblem" | "byZip" | "police" | "fire" | "ems"> {
  const problems = new Map<string, number>();
  const zips = new Map<string, number>();
  let police = 0;
  let fire = 0;
  let ems = 0;
  for (const c of calls) {
    problems.set(c.problem, (problems.get(c.problem) ?? 0) + 1);
    if (c.zip) zips.set(c.zip, (zips.get(c.zip) ?? 0) + 1);
    if (c.agency === "fire") fire += 1;
    else if (c.agency === "ems") ems += 1;
    else police += 1;
  }
  const named = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n);
  return {
    byProblem: named(problems),
    byZip: named(zips).map((r) => ({ zip: r.name, n: r.n })),
    police,
    fire,
    ems,
  };
}

function emptyFeed(day: string, error: string): DailyFeed {
  return {
    day,
    requestedDay: day,
    label: labelChicagoDay(day),
    lagged: false,
    fetchedAt: new Date().toISOString(),
    source: "SAPD 7-day calls for service + SAFD TACC",
    total: 0,
    calls: [],
    byProblem: [],
    byZip: [],
    police: 0,
    fire: 0,
    ems: 0,
    error,
  };
}

export function isDailyFeed(v: unknown): v is DailyFeed {
  if (!v || typeof v !== "object") return false;
  const o = v as DailyFeed;
  return typeof o.day === "string" && Array.isArray(o.calls);
}

export async function loadDailyDispatch(now = Date.now()): Promise<DailyFeed> {
  const requested = previousChicagoDay(now);
  const key = requested;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;

  let day = requested;
  let lagged = false;
  let police: LiveCall[] = [];
  let error: string | null = null;
  try {
    police = await loadArcgisDayCalls(day);
    if (police.length === 0) {
      const latest = await latestArcgisDay();
      if (latest && latest !== day) {
        day = latest;
        lagged = true;
        police = await loadArcgisDayCalls(day);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not reach the SAPD 7-day dispatch board.";
  }

  const fire = await fetchTaccDay(day);
  const seen = new Set(police.map((c) => c.id));
  const calls = [...police];
  for (const c of fire) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    calls.push(c);
  }
  calls.sort((a, b) => b.whenMs - a.whenMs);

  if (calls.length === 0) {
    const value = emptyFeed(
      requested,
      error ?? "No public dispatches for yesterday yet. The 7-day board updates after the day closes.",
    );
    cache = { key, at: Date.now(), value };
    return value;
  }

  const stats = tally(calls);
  const value: DailyFeed = {
    day,
    requestedDay: requested,
    label: labelChicagoDay(day),
    lagged,
    fetchedAt: new Date().toISOString(),
    source: "SAPD 7-day calls for service (as called in) + SAFD TACC fire",
    total: calls.length,
    calls,
    ...stats,
    error: lagged
      ? `Yesterday is not on the 7-day board yet. Showing ${labelChicagoDay(day)}, the latest complete day.`
      : error,
  };
  cache = { key, at: Date.now(), value };
  return value;
}
