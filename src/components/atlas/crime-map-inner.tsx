import type { Feature, FeatureCollection, Geometry } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { HEAT, SA_BOUNDS, SA_CENTER } from "@/lib/crime/constants";
import { binIndex, formatCompact, formatNumber, parseCoord, quantileBreaks } from "@/lib/crime/format";
import type { GeoQuality, LiveCall } from "@/lib/crime/live";
import type { AreaProps, Metric, ZipProps, ZipStat } from "@/lib/crime/types";
import type { MapSelection } from "./crime-map";

type Props = {
  zipGeo: FeatureCollection | null;
  areaGeo: FeatureCollection | null;
  zips: ZipStat[];
  areas: { name: string; n: number }[];
  geography: "zip" | "area";
  metric: Metric;
  selected: MapSelection;
  onSelect: (sel: MapSelection) => void;
  user: { lat: number; lng: number } | null;
  homeZip: string | null;
  watchZips: string[];
  liveCalls: LiveCall[];
  selectedCallId: string | null;
  onSelectCall: (call: LiveCall) => void;
  focus: { lat: number; lng: number; zoom?: number } | null;
  showHeat: boolean;
  showLive: boolean;
  onHoverZip?: (zip: string | null) => void;
};

type PinCall = LiveCall & { lat: number; lng: number; geo: GeoQuality };

type PinColors = {
  accent: string;
  accentFg: string;
  fire: string;
  ems: string;
  heat: string;
  subtle: string;
};

const TILE = {
  updateWhenZooming: false,
  updateWhenIdle: true,
  keepBuffer: 4,
} as const;

const SEV_PAINT = { low: 0, medium: 1, high: 2 } as const;

function valueForZip(stat: ZipStat | undefined, sqmi: number, metric: Metric): number {
  const n = stat?.n ?? 0;
  if (metric === "density") return sqmi > 0 ? n / sqmi : 0;
  if (metric === "spike") return stat && stat.prev > 0 ? stat.n / stat.prev : 0;
  return n;
}

function valueForArea(n: number, sqmi: number, metric: Metric): number {
  if (metric === "density") return sqmi > 0 ? n / sqmi : 0;
  return n;
}

function fillFor(value: number, breaks: number[]): string {
  const i = binIndex(value, breaks);
  if (i < 0) return "color-mix(in oklab, var(--color-surface-2) 80%, transparent)";
  return HEAT[Math.min(i, HEAT.length - 1)] ?? HEAT[0];
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function readPinColors(): PinColors {
  return {
    accent: token("--color-accent", "#c612af"),
    accentFg: token("--color-accent-fg", "#ffffff"),
    fire: token("--color-fire", "#e85d04"),
    ems: token("--color-ems", "#2a9d8f"),
    heat: token("--color-heat-3", "#d26532"),
    subtle: token("--color-subtle", "#6a6d68"),
  };
}

function pinFill(call: LiveCall, colors: PinColors): string {
  if (call.agency === "fire") return colors.fire;
  if (call.agency === "ems") return colors.ems;
  if (call.severity === "high") return colors.accent;
  if (call.severity === "medium") return colors.heat;
  return colors.subtle;
}

function pinRadius(call: PinCall, zoom: number, active: boolean): number {
  const scale = zoom >= 14 ? 1.2 : zoom >= 12 ? 1 : 0.72;
  const base = active ? 9 : call.geo === "zip" ? 8 : call.severity === "high" ? 7 : 5;
  return Math.max(3.5, base * scale);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeTo(map: L.Map, lat: number, lng: number, zoom: number) {
  const target = L.latLng(lat, lng);
  const dist = map.distance(map.getCenter(), target);
  const zoomDelta = Math.abs(map.getZoom() - zoom);
  if (dist < 60 && zoomDelta < 0.35) return;
  if (prefersReducedMotion()) {
    map.setView(target, zoom, { animate: false });
    return;
  }
  if (dist < 700 && zoomDelta <= 1) {
    map.setView(target, zoom, { animate: true, duration: 0.28 });
    return;
  }
  map.flyTo(target, zoom, { duration: 0.4 });
}

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function Basemap() {
  return (
    <TileLayer
      url={OSM}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      className="atlas-basemap"
      {...TILE}
    />
  );
}

function FlyTo({
  selected,
  zipGeo,
  areaGeo,
  user,
  focus,
}: {
  selected: MapSelection;
  zipGeo: FeatureCollection | null;
  areaGeo: FeatureCollection | null;
  user: { lat: number; lng: number } | null;
  focus: { lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();
  const lastUser = useRef<string | null>(null);
  const lastFocus = useRef<string | null>(null);
  const lastSel = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      lastUser.current = null;
      return;
    }
    const key = `${user.lat.toFixed(4)},${user.lng.toFixed(4)}`;
    if (lastUser.current === key) return;
    lastUser.current = key;
    easeTo(map, user.lat, user.lng, Math.max(map.getZoom(), 12));
  }, [user, map]);

  useEffect(() => {
    if (!focus) {
      lastFocus.current = null;
      return;
    }
    const key = `${focus.lat.toFixed(4)},${focus.lng.toFixed(4)},${focus.zoom ?? 15}`;
    if (lastFocus.current === key) return;
    lastFocus.current = key;
    easeTo(map, focus.lat, focus.lng, Math.max(map.getZoom(), focus.zoom ?? 15));
  }, [focus, map]);

  useEffect(() => {
    if (!selected) {
      lastSel.current = null;
      return;
    }
    const selKey = `${selected.kind}:${selected.id}`;
    if (lastSel.current === selKey) return;
    lastSel.current = selKey;
    if (selected.kind === "zip" && zipGeo) {
      const f = zipGeo.features.find((feat) => String((feat.properties as ZipProps | null)?.ZIP) === selected.id);
      const lat = parseCoord((f?.properties as ZipProps | undefined)?.Lat);
      const lng = parseCoord((f?.properties as ZipProps | undefined)?.Lng);
      if (lat != null && lng != null) easeTo(map, lat, lng, Math.max(map.getZoom(), 11));
    }
    if (selected.kind === "area" && areaGeo) {
      const f = areaGeo.features.find(
        (feat) => String((feat.properties as AreaProps | null)?.SUBSTN).toUpperCase() === selected.id,
      );
      if (f) {
        const layer = L.geoJSON(f as Feature);
        const b = layer.getBounds();
        layer.remove();
        if (b.isValid()) {
          if (prefersReducedMotion()) map.fitBounds(b.pad(0.15), { animate: false, maxZoom: 12 });
          else map.flyToBounds(b.pad(0.15), { duration: 0.4, maxZoom: 12 });
        }
      }
    }
  }, [selected, zipGeo, areaGeo, map]);

  return null;
}

function Invalidate() {
  const map = useMap();
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    };
    window.addEventListener("resize", onResize, { passive: true });
    const t = window.setTimeout(onResize, 80);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [map]);
  return null;
}

function MoveHint() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const start = () => el.classList.add("is-moving");
    const end = () => el.classList.remove("is-moving");
    map.on("movestart zoomstart", start);
    map.on("moveend zoomend", end);
    return () => {
      map.off("movestart zoomstart", start);
      map.off("moveend zoomend", end);
      el.classList.remove("is-moving");
    };
  }, [map]);
  return null;
}

function LivePins({
  pins,
  selectedId,
  onSelectCall,
}: {
  pins: PinCall[];
  selectedId: string | null;
  onSelectCall: (call: LiveCall) => void;
}) {
  const map = useMap();
  const pinsRef = useRef(pins);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelectCall);
  const syncRef = useRef<() => void>(() => {});
  pinsRef.current = pins;
  selectedRef.current = selectedId;
  onSelectRef.current = onSelectCall;

  useEffect(() => {
    const colors = readPinColors();
    const renderer = L.canvas({ padding: 0.55, tolerance: 12 });
    const group = L.layerGroup().addTo(map);
    const pulses = L.layerGroup().addTo(map);
    const pulseIcon = L.divIcon({
      className: "pulse-mark",
      html: "<span></span>",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const camIcon = L.divIcon({
      className: "cam-mark",
      html: '<span><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const circles = new Map<string, L.CircleMarker>();
    const pulseMarks = new Map<string, L.Marker>();
    let camMarker: L.Marker | null = null;

    const sync = () => {
      const zoom = map.getZoom();
      const bounds = map.getBounds().pad(0.45);
      const visible = pinsRef.current.filter((c) => bounds.contains([c.lat, c.lng]));
      const visibleIds = new Set(visible.map((c) => c.id));
      const selected = selectedRef.current;

      for (const [id, layer] of circles) {
        if (!visibleIds.has(id)) {
          group.removeLayer(layer);
          circles.delete(id);
        }
      }
      for (const [id, layer] of pulseMarks) {
        if (!visibleIds.has(id)) {
          pulses.removeLayer(layer);
          pulseMarks.delete(id);
        }
      }

      const draw = visible.slice().sort((a, b) => SEV_PAINT[a.severity] - SEV_PAINT[b.severity] || a.whenMs - b.whenMs);
      for (const c of draw) {
        const active = selected === c.id;
        const zipOnly = c.geo === "zip";
        const fill = pinFill(c, colors);
        const style: L.PathOptions = {
          color: active ? colors.accentFg : fill,
          weight: active ? 2 : zipOnly ? 1.5 : 1,
          fillColor: fill,
          fillOpacity: zipOnly ? 0.28 : 0.92,
          dashArray: zipOnly ? "3 3" : "",
        };
        let marker = circles.get(c.id);
        if (!marker) {
          marker = L.circleMarker([c.lat, c.lng], {
            ...style,
            radius: pinRadius(c, zoom, active),
            renderer,
            bubblingMouseEvents: false,
          });
          const id = c.id;
          marker.on("click", (e) => {
            L.DomEvent.stop(e);
            const call = pinsRef.current.find((x) => x.id === id);
            if (call) onSelectRef.current(call);
          });
          group.addLayer(marker);
          circles.set(c.id, marker);
        } else {
          marker.setLatLng([c.lat, c.lng]);
          marker.setRadius(pinRadius(c, zoom, active));
          marker.setStyle(style);
        }
      }

      let budget = 0;
      const pulseWanted = new Set<string>();
      for (const c of visible) {
        if (c.severity !== "high" || c.geo !== "block" || budget >= 12) continue;
        budget += 1;
        pulseWanted.add(c.id);
        let pulse = pulseMarks.get(c.id);
        if (!pulse) {
          pulse = L.marker([c.lat, c.lng], {
            icon: pulseIcon,
            interactive: false,
            keyboard: false,
            zIndexOffset: -20,
          });
          pulses.addLayer(pulse);
          pulseMarks.set(c.id, pulse);
        } else {
          pulse.setLatLng([c.lat, c.lng]);
        }
      }
      for (const [id, layer] of pulseMarks) {
        if (pulseWanted.has(id)) continue;
        pulses.removeLayer(layer);
        pulseMarks.delete(id);
      }

      const selectedCall = pinsRef.current.find((c) => c.id === selected);
      const cam = selectedCall?.camera;
      if (cam && Number.isFinite(cam.lat) && Number.isFinite(cam.lng)) {
        const lat = cam.lat as number;
        const lng = cam.lng as number;
        if (!camMarker) {
          camMarker = L.marker([lat, lng], { icon: camIcon, keyboard: false, zIndexOffset: 40 });
          camMarker.addTo(map);
        } else {
          camMarker.setLatLng([lat, lng]);
        }
      } else if (camMarker) {
        map.removeLayer(camMarker);
        camMarker = null;
      }
    };

    syncRef.current = sync;
    map.on("moveend zoomend", sync);
    sync();
    return () => {
      map.off("moveend zoomend", sync);
      syncRef.current = () => {};
      group.remove();
      pulses.remove();
      if (camMarker) map.removeLayer(camMarker);
      renderer.remove();
      circles.clear();
      pulseMarks.clear();
    };
  }, [map]);

  useEffect(() => {
    syncRef.current();
  }, [pins, selectedId]);

  return null;
}

export const CrimeMapInner = memo(function CrimeMapInner({
  zipGeo,
  areaGeo,
  zips,
  areas,
  geography,
  metric,
  selected,
  onSelect,
  user,
  homeZip,
  watchZips,
  liveCalls,
  selectedCallId,
  onSelectCall,
  focus,
  showHeat,
  showLive,
  onHoverZip,
}: Props) {
  const zipIndex = useMemo(() => new Map(zips.map((z) => [z.zip, z])), [zips]);
  const areaIndex = useMemo(() => new Map(areas.map((a) => [a.name.toUpperCase(), a.n])), [areas]);
  const watched = useMemo(() => new Set(watchZips), [watchZips]);

  const onSelectRef = useRef(onSelect);
  const onHoverZipRef = useRef(onHoverZip);
  const zipIndexRef = useRef(zipIndex);
  const areaIndexRef = useRef(areaIndex);
  const metricRef = useRef(metric);
  onSelectRef.current = onSelect;
  onHoverZipRef.current = onHoverZip;
  zipIndexRef.current = zipIndex;
  areaIndexRef.current = areaIndex;
  metricRef.current = metric;

  const zipPt = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const f of zipGeo?.features ?? []) {
      const p = f.properties as ZipProps;
      const lat = parseCoord(p.Lat);
      const lng = parseCoord(p.Lng);
      if (lat != null && lng != null) map.set(String(p.ZIP), { lat, lng });
    }
    return map;
  }, [zipGeo]);

  const zipValues = useMemo(() => {
    if (!zipGeo) return [];
    return zipGeo.features.map((f) => {
      const p = f.properties as ZipProps;
      return valueForZip(zipIndex.get(String(p.ZIP)), Number(p.SQMI) || 0, metric);
    });
  }, [zipGeo, zipIndex, metric]);

  const areaValues = useMemo(() => {
    if (!areaGeo) return [];
    return areaGeo.features.map((f) => {
      const p = f.properties as AreaProps;
      return valueForArea(areaIndex.get(String(p.SUBSTN).toUpperCase()) ?? 0, Number(p.SqMiles) || 0, metric);
    });
  }, [areaGeo, areaIndex, metric]);

  const zipBreaks = useMemo(() => quantileBreaks(zipValues), [zipValues]);
  const areaBreaks = useMemo(() => quantileBreaks(areaValues), [areaValues]);

  const pins = useMemo(() => {
    if (!showLive) return [] as PinCall[];
    const next: PinCall[] = [];
    for (const c of liveCalls) {
      if (c.lat != null && c.lng != null) {
        next.push({ ...c, lat: c.lat, lng: c.lng, geo: c.geo ?? "block" });
        continue;
      }
      const z = zipPt.get(c.zip);
      if (z) next.push({ ...c, lat: z.lat, lng: z.lng, geo: "zip" });
    }
    next.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity] || b.whenMs - a.whenMs;
    });
    return next.slice(0, 120);
  }, [liveCalls, zipPt, showLive]);

  const zipStyle = useCallback(
    (feature?: Feature<Geometry, ZipProps>) => {
      if (!feature) return {};
      const p = feature.properties;
      const zip = String(p.ZIP);
      const v = valueForZip(zipIndex.get(zip), Number(p.SQMI) || 0, metric);
      const isSel = selected?.kind === "zip" && selected.id === zip;
      const isHome = homeZip === zip || watched.has(zip);
      return {
        color: isHome || isSel ? "var(--color-accent)" : "color-mix(in oklab, var(--color-fg) 18%, transparent)",
        weight: isHome || isSel ? 2 : 0.7,
        fillColor: fillFor(v, zipBreaks),
        fillOpacity: v > 0 ? 0.62 : 0.12,
      };
    },
    [zipIndex, metric, selected, homeZip, watched, zipBreaks],
  );

  const areaStyle = useCallback(
    (feature?: Feature<Geometry, AreaProps>) => {
      if (!feature) return {};
      const p = feature.properties;
      const id = String(p.SUBSTN).toUpperCase();
      const v = valueForArea(areaIndex.get(id) ?? 0, Number(p.SqMiles) || 0, metric);
      const isSel = selected?.kind === "area" && selected.id === id;
      return {
        color: isSel ? "var(--color-accent)" : "color-mix(in oklab, var(--color-fg) 22%, transparent)",
        weight: isSel ? 2 : 1,
        fillColor: fillFor(v, areaBreaks),
        fillOpacity: v > 0 ? 0.62 : 0.12,
      };
    },
    [areaIndex, metric, selected, areaBreaks],
  );

  const zipStyleRef = useRef(zipStyle);
  const areaStyleRef = useRef(areaStyle);
  zipStyleRef.current = zipStyle;
  areaStyleRef.current = areaStyle;

  const onEachZip = useCallback((feature: Feature<Geometry, ZipProps>, layer: L.Layer) => {
    const zip = String(feature.properties.ZIP);
    const name = feature.properties.PO_NAME;
    const sqmi = Number(feature.properties.SQMI) || 0;
    layer.bindTooltip("", { sticky: true, className: "atlas-tooltip", opacity: 1 });
    layer.on({
      click: () => onSelectRef.current({ kind: "zip", id: zip }),
      mouseover: (e) => {
        const stat = zipIndexRef.current.get(zip);
        const n = stat?.n ?? 0;
        const density = sqmi > 0 ? n / sqmi : 0;
        const label =
          metricRef.current === "density" ? `${formatCompact(density)} / sq mi` : `${formatNumber(n)} reports`;
        const spike = stat && stat.prev > 0 ? `<br/>${(stat.n / stat.prev).toFixed(1)}× prior period` : "";
        layer.setTooltipContent(`<div><strong>${zip}</strong> · ${name}<br/>${label}${spike}</div>`);
        const path = e.target as L.Path;
        path.setStyle({ weight: 1.6, color: "var(--color-accent)" });
        path.bringToFront();
        onHoverZipRef.current?.(zip);
      },
      mouseout: (e) => {
        (e.target as L.Path).setStyle(zipStyleRef.current(feature));
        onHoverZipRef.current?.(null);
      },
    });
  }, []);

  const onEachArea = useCallback((feature: Feature<Geometry, AreaProps>, layer: L.Layer) => {
    const id = String(feature.properties.SUBSTN).toUpperCase();
    const sqmi = Number(feature.properties.SqMiles) || 0;
    layer.bindTooltip("", { sticky: true, className: "atlas-tooltip", opacity: 1 });
    layer.on({
      click: () => onSelectRef.current({ kind: "area", id }),
      mouseover: (e) => {
        const n = areaIndexRef.current.get(id) ?? 0;
        const density = sqmi > 0 ? n / sqmi : 0;
        const label =
          metricRef.current === "density" ? `${formatCompact(density)} / sq mi` : `${formatNumber(n)} reports`;
        layer.setTooltipContent(`<div><strong>${id}</strong> service area<br/>${label}</div>`);
        const path = e.target as L.Path;
        path.setStyle({ weight: 2, color: "var(--color-accent)" });
        path.bringToFront();
      },
      mouseout: (e) => {
        (e.target as L.Path).setStyle(areaStyleRef.current(feature));
      },
    });
  }, []);

  return (
    <MapContainer
      center={SA_CENTER}
      zoom={10}
      minZoom={9}
      maxZoom={16}
      maxBounds={SA_BOUNDS}
      maxBoundsViscosity={0.7}
      zoomControl={false}
      attributionControl
      wheelDebounceTime={50}
      wheelPxPerZoomLevel={90}
      className="h-full w-full bg-bg"
    >
      <Basemap />
      <ZoomControl position="topright" />
      <Invalidate />
      <MoveHint />
      <FlyTo selected={selected} zipGeo={zipGeo} areaGeo={areaGeo} user={user} focus={focus} />

      {showHeat && geography === "zip" && zipGeo ? (
        <GeoJSON data={zipGeo} style={zipStyle} onEachFeature={onEachZip} />
      ) : null}

      {showHeat && geography === "area" && areaGeo ? (
        <GeoJSON data={areaGeo} style={areaStyle} onEachFeature={onEachArea} />
      ) : null}

      {showLive ? <LivePins pins={pins} selectedId={selectedCallId} onSelectCall={onSelectCall} /> : null}

      {user ? (
        <CircleMarker
          center={[user.lat, user.lng]}
          radius={8}
          pathOptions={{
            color: "var(--color-accent-fg)",
            weight: 2,
            fillColor: "var(--color-accent)",
            fillOpacity: 1,
          }}
        />
      ) : null}
    </MapContainer>
  );
});
