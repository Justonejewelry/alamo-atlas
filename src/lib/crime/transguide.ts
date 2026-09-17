import type { LiveCall } from "./cad-parse";

const UA = "AlamoAtlas/1.0 (San Antonio public-safety map)";
const BASE = "https://its.txdot.gov/its/";
const MAX_CAM_MILES = 0.85;
const MAX_INCIDENT_MILES = 1.2;

export const TRAFFIC_PROBLEM =
  /\b(crash|accident|collision|mvc|stalled|disabled vehicle|traffic related|traffic hazard|wrong.?way|high water|vehicle fire|major accident)\b/i;

export const HIGHWAY_LINE =
  /\b(IH-?\s*\d|I-\d{1,3}|INTERSTATE|LOOP\s*410|LOOP\s*1604|LP-?410|LP-?1604|US\s*HWY|US-?\d{1,3}|SH-?\d+|WURZBACH PKWY)\b/i;

export type TrafficCamera = {
  id: string;
  name: string;
  roadway: string;
  lat: number;
  lng: number;
};

export type CameraHit = {
  id: string;
  name: string;
  roadway: string;
  miles: number;
  lat: number;
  lng: number;
};

export type TxdotNote = {
  id: string;
  summary: string;
};

type Cache<T> = { at: number; value: T };
let cameraCache: Cache<TrafficCamera[]> | null = null;
let incidentCache: Cache<Incident[]> | null = null;

type Incident = {
  id: string;
  lat: number;
  lng: number;
  summary: string;
};

export function isTrafficCall(call: Pick<LiveCall, "problem" | "address" | "street" | "locationType">): boolean {
  if (TRAFFIC_PROBLEM.test(call.problem)) return true;
  const line = `${call.address} ${call.street} ${call.locationType ?? ""}`;
  return HIGHWAY_LINE.test(line) && /\b(crash|accident|collision|mvc|stall|disabled|traffic related|traffic hazard|vehicle fire)\b/i.test(call.problem);
}

async function itsJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`transguide ${res.status}`);
  return res.json();
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function inCounty(lat: number, lng: number): boolean {
  return lat >= 29.08 && lat <= 29.78 && lng >= -98.9 && lng <= -98.05;
}

export async function loadSatCameras(): Promise<TrafficCamera[]> {
  if (cameraCache && Date.now() - cameraCache.at < 30 * 60_000) return cameraCache.value;
  const json = (await itsJson("DistrictIts/GetCctvStatusListByDistrict?districtCode=SAT")) as {
    roadwayCctvStatuses?: Record<string, Array<Record<string, unknown>>>;
  };
  const out: TrafficCamera[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(json.roadwayCctvStatuses ?? {})) {
    for (const row of list ?? []) {
      if (row.hasSnapshot === false) continue;
      const id = String(row.icd_Id ?? row.name ?? "");
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!id || seen.has(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!inCounty(lat, lng)) continue;
      seen.add(id);
      const equip = (row.equipLoc as { roadway?: string } | undefined) ?? {};
      out.push({
        id,
        name: String(row.name ?? id),
        roadway: String(equip.roadway ?? ""),
        lat,
        lng,
      });
    }
  }
  cameraCache = { at: Date.now(), value: out };
  return out;
}

function incidentPoint(row: Record<string, unknown>): { lat: number; lng: number } | null {
  const start = (row.startLocation as Record<string, unknown> | undefined) ?? {};
  const lat = Number(start.latString ?? row.latString);
  const lng = Number(start.lonString ?? row.lonString);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCounty(lat, lng)) return null;
  return { lat, lng };
}

function incidentSummary(row: Record<string, unknown>): string {
  const kind = String(row.eventTypeDescription || row.typeDescription || row.desc || "Incident").trim();
  const desc = String(row.desc ?? "").trim();
  const lanes = Array.isArray(row.affectedLanesDetailDisplayStrings)
    ? (row.affectedLanesDetailDisplayStrings as string[]).filter((s) => s && !/cleared/i.test(s)).slice(0, 2)
    : [];
  const bits = [kind];
  if (desc && desc.toUpperCase() !== kind.toUpperCase()) bits.push(desc);
  if (lanes.length) bits.push(lanes.join("; "));
  return bits.join(" · ").slice(0, 160);
}

async function loadSatIncidents(): Promise<Incident[]> {
  if (incidentCache && Date.now() - incidentCache.at < 2 * 60_000) return incidentCache.value;
  const json = (await itsJson("DistrictIts/GetIncidentListByDistrict?districtCode=SAT")) as {
    incidents?: Array<Record<string, unknown>>;
  };
  const out: Incident[] = [];
  for (const row of json.incidents ?? []) {
    const pt = incidentPoint(row);
    if (!pt) continue;
    const status = String(row.statusDescription ?? "");
    if (/cleared/i.test(status)) continue;
    out.push({
      id: String(row.icd_Id ?? ""),
      lat: pt.lat,
      lng: pt.lng,
      summary: incidentSummary(row),
    });
  }
  incidentCache = { at: Date.now(), value: out };
  return out;
}

export function nearestCamera(
  lat: number,
  lng: number,
  cameras: TrafficCamera[],
  maxMiles = MAX_CAM_MILES,
): CameraHit | null {
  let best: CameraHit | null = null;
  for (const cam of cameras) {
    const miles = haversineMiles({ lat, lng }, { lat: cam.lat, lng: cam.lng });
    if (miles > maxMiles) continue;
    if (!best || miles < best.miles) best = { id: cam.id, name: cam.name, roadway: cam.roadway, miles, lat: cam.lat, lng: cam.lng };
  }
  return best;
}

export async function decorateTraffic(calls: LiveCall[]): Promise<LiveCall[]> {
  const traffic = calls.filter(isTrafficCall);
  if (!traffic.length) return calls;
  let cameras: TrafficCamera[] = [];
  let incidents: Incident[] = [];
  try {
    [cameras, incidents] = await Promise.all([loadSatCameras().catch(() => []), loadSatIncidents().catch(() => [])]);
  } catch {
    return calls;
  }
  if (!cameras.length && !incidents.length) return calls;
  return calls.map((c) => {
    if (!isTrafficCall(c) || c.lat == null || c.lng == null) return c;
    const highway = HIGHWAY_LINE.test(`${c.address} ${c.street}`);
    let camera = cameras.length ? nearestCamera(c.lat, c.lng, cameras, highway ? MAX_CAM_MILES : 0.35) : null;
    let txdot: TxdotNote | undefined;
    let bestMiles = MAX_INCIDENT_MILES;
    for (const inc of incidents) {
      const miles = haversineMiles({ lat: c.lat, lng: c.lng }, { lat: inc.lat, lng: inc.lng });
      if (miles <= bestMiles) {
        bestMiles = miles;
        txdot = { id: inc.id, summary: inc.summary };
      }
    }
    if (!camera && !txdot) return c;
    return { ...c, camera: camera ?? undefined, txdot };
  });
}

export async function snapshotJpeg(icdId: string): Promise<Uint8Array | null> {
  const id = icdId.trim().slice(0, 80);
  if (!id) return null;
  const params = new URLSearchParams({ icdId: id, districtCode: "SAT" });
  const json = (await itsJson(`DistrictIts/GetCctvSnapshotByIcdId?${params}`)) as { snippet?: string };
  const b64 = json.snippet;
  if (!b64) return null;
  const bin = Buffer.from(b64, "base64");
  return new Uint8Array(bin);
}
