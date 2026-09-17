import type { FeatureCollection, Geometry } from "geojson";
import type { LiveCall } from "./cad-parse";

import type { ZipProps } from "./types";

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function rad(d: number): number {
  return (d * Math.PI) / 180;
}

function ringContains(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(lng: number, lat: number, geom: Geometry): boolean {
  if (geom.type === "Polygon") {
    const [outer, ...holes] = geom.coordinates;
    if (!outer || !ringContains(lng, lat, outer)) return false;
    return !holes.some((h) => ringContains(lng, lat, h));
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly) => {
      const [outer, ...holes] = poly;
      if (!outer || !ringContains(lng, lat, outer)) return false;
      return !holes.some((h) => ringContains(lng, lat, h));
    });
  }
  return false;
}

export type HomeZip = {
  zip: string;
  name: string;
  lat: number;
  lng: number;
  miles: number;
};

export function locateInZips(lat: number, lng: number, fc: FeatureCollection): HomeZip | null {
  let hit: HomeZip | null = null;
  let nearest: HomeZip | null = null;
  for (const f of fc.features) {
    const p = f.properties as ZipProps | null;
    if (!p) continue;
    const zlat = Number(p.Lat);
    const zlng = Number(p.Lng);
    if (!Number.isFinite(zlat) || !Number.isFinite(zlng)) continue;
    const miles = haversineMiles({ lat, lng }, { lat: zlat, lng: zlng });
    const rec = { zip: String(p.ZIP), name: p.PO_NAME, lat: zlat, lng: zlng, miles };
    if (!nearest || miles < nearest.miles) nearest = rec;
    if (f.geometry && pointInGeometry(lng, lat, f.geometry)) {
      if (!hit || miles < hit.miles) hit = rec;
    }
  }
  return hit ?? nearest;
}

export function inBexar(lat: number, lng: number): boolean {
  return lat >= 29.08 && lat <= 29.78 && lng >= -98.9 && lng <= -98.05;
}

export function callPoint(
  c: LiveCall,
  centroids: Map<string, { lat: number; lng: number }>,
): { lat: number; lng: number } | null {
  if (c.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
  const z = centroids.get(c.zip);
  return z ?? null;
}

export function rankNearbyCalls(
  calls: LiveCall[],
  origin: { lat: number; lng: number },
  centroids: Map<string, { lat: number; lng: number }>,
  opts: { maxMiles: number; homeZips: string[] },
): Array<LiveCall & { miles: number }> {
  const home = new Set(opts.homeZips);
  const out: Array<LiveCall & { miles: number }> = [];
  for (const c of calls) {
    const pt = callPoint(c, centroids);
    const miles = pt ? haversineMiles(origin, pt) : 99;
    if (home.has(c.zip) || miles <= opts.maxMiles) out.push({ ...c, miles });
  }
  out.sort((a, b) => a.miles - b.miles || b.whenMs - a.whenMs);
  return out;
}

export { placeMatches } from "./cad-parse";
