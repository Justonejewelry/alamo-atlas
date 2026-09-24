import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertsFeed, type AgencyFilter, type LiveSevFilter } from "@/components/atlas/alerts-feed";
import {
  AppDock,
  AppTopBar,
  FiltersRoll,
  LocateFab,
  MoreRoll,
  SearchRoll,
  type ChromeMenu,
  type SearchHit,
} from "@/components/atlas/app-chrome";
import { HowTo, HOWTO_IDS } from "@/components/atlas/how-to";
import { LoadingScreen } from "@/components/atlas/loading-screen";
import { StartScreen } from "@/components/atlas/start-screen";
import { CrimeMap, type MapSelection } from "@/components/atlas/crime-map";
import { Hint } from "@/components/atlas/hint";
import { StatsPanel } from "@/components/atlas/stats-panel";
import { useGeo } from "@/components/atlas/use-geo";
import {
  GROUP_SHORT,
  HEAT,
  NIBRS_GROUPS,
  PLACE_ZIPS,
  RANGES,
  type AgainstId,
  type RangeId,
} from "@/lib/crime/constants";
import { dailyCsv } from "@/lib/crime/csv";
import { formatNumber, formatSpike, parseCoord, quantileBreaks, spikeRatio } from "@/lib/crime/format";
import { inBexar, locateInZips, placeMatches, rankNearbyCalls, type HomeZip } from "@/lib/crime/geo";
import {
  digestCalls,
  loadLocalHistory,
  mergeHistory,
  overnightCutoff,
  saveLocalHistory,
} from "@/lib/crime/history-store";
import { useT } from "@/lib/crime/i18n";
import { getLiveDispatch, isLiveFeed, type LiveCall, type LiveWindow, withinLiveWindow } from "@/lib/crime/live";
import { isDailyFeed, type DailyFeed } from "@/lib/crime/daily";
import { dailyDispatchPdf } from "@/lib/crime/pdf";
import { notifyCalls, notifyFollow, registerAtlasAlerts, requestQuietAlerts } from "@/lib/crime/notify";
import { usePrefs, type FollowItem, type Locale } from "@/lib/crime/prefs";
import { callFingerprint, diffFollowedCalls, reportFingerprint } from "@/lib/crime/follow";
import { getCrimeSnapshot, getDemandStats, getOffenseReports, getZipDetail, isCrimeSnapshot } from "@/lib/crime/snapshot";
import type { Geography, Metric, ZipProps, ZipStat } from "@/lib/crime/types";
import { cn } from "@/lib/utils";

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.json() as Promise<T>;
}

type PanelTab = "live" | "stats";

const EMPTY_ZIPS: ZipStat[] = [];
const EMPTY_AREAS: { name: string; n: number }[] = [];
const HOWTO_CONTACT = HOWTO_IDS.indexOf("contact");

function isRange(v: string | null): v is RangeId {
  return !!v && RANGES.some((r) => r.id === v);
}

function isAgainst(v: string | null): v is AgainstId {
  return v === "PERSON" || v === "PROPERTY" || v === "SOCIETY";
}

export function AtlasApp() {
  const t = useT();
  const locale = usePrefs((s) => s.locale);
  const setLocale = usePrefs((s) => s.setLocale);
  const watch = usePrefs((s) => s.watch);
  const addWatch = usePrefs((s) => s.addWatch);
  const removeWatch = usePrefs((s) => s.removeWatch);
  const follow = usePrefs((s) => s.follow) ?? [];
  const removeFollow = usePrefs((s) => s.removeFollow);
  const markFollow = usePrefs((s) => s.markFollow);
  const notify = usePrefs((s) => s.notify);
  const setNotify = usePrefs((s) => s.setNotify);
  const digestAt = usePrefs((s) => s.digestAt);
  const markDigest = usePrefs((s) => s.markDigest);
  const seenIntro = usePrefs((s) => s.seenIntro);
  const seenHowTo = usePrefs((s) => s.seenHowTo);
  const dismissIntro = usePrefs((s) => s.dismissIntro);
  const dismissHowTo = usePrefs((s) => s.dismissHowTo);
  const hydrated = usePrefs((s) => s.hydrated);

  const [range, setRange] = useState<RangeId>("ytd");
  const [against, setAgainst] = useState<AgainstId>("ALL");
  const [group, setGroup] = useState<string>("ALL");
  const [geography, setGeography] = useState<Geography>("zip");
  const [metric, setMetric] = useState<Metric>("count");
  const [selected, setSelected] = useState<MapSelection>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("live");
  const [query, setQuery] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sevFilter, setSevFilter] = useState<LiveSevFilter>("all");
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>("all");
  const [division, setDivision] = useState("ALL");
  const [priorityNear, setPriorityNear] = useState(false);
  const [selectedCall, setSelectedCall] = useState<LiveCall | null>(null);
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showYesterday, setShowYesterday] = useState(false);
  const [liveWindow, setLiveWindow] = useState<LiveWindow>("all");
  const [hoverZip, setHoverZip] = useState<string | null>(null);
  const [localHistory, setLocalHistory] = useState<LiveCall[]>([]);
  const [menu, setMenu] = useState<ChromeMenu>(null);
  const [howToReplay, setHowToReplay] = useState(false);
  const [howToStart, setHowToStart] = useState(0);
  const [howToSessionSkip, setHowToSessionSkip] = useState(false);
  const { geo, request } = useGeo();

  useEffect(() => {
    void usePrefs.persist.rehydrate();
    setLocalHistory(loadLocalHistory());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const lang = sp.get("lang");
    if (lang === "en" || lang === "es") setLocale(lang);
    const r = sp.get("range");
    if (isRange(r)) setRange(r);
    const ag = sp.get("against");
    if (isAgainst(ag)) setAgainst(ag);
    const g = sp.get("group") ?? sp.get("offense");
    if (g) setGroup(g);
    const mode = sp.get("mode");
    if (mode === "reports") {
      setTab("stats");
      setPanelOpen(true);
    } else if (mode === "live") {
      setTab("live");
    }
    const zip = (sp.get("zip") ?? "").replace(/\D/g, "").slice(0, 5);
    if (/^\d{5}$/.test(zip)) {
      setSelected({ kind: "zip", id: zip });
      setGeography("zip");
      setPanelOpen(true);
      dismissHowTo();
      dismissIntro();
    }
  }, [setLocale, dismissHowTo, dismissIntro]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams();
    sp.set("mode", tab === "stats" ? "reports" : "live");
    if (selected?.kind === "zip") sp.set("zip", selected.id);
    if (range !== "ytd") sp.set("range", range);
    if (against !== "ALL") sp.set("against", against);
    if (group !== "ALL") sp.set("group", group);
    if (locale !== "en") sp.set("lang", locale);
    const qs = sp.toString();
    const next = qs ? `?${qs}` : "/";
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [tab, selected, range, against, group, locale]);

  const zipGeoQuery = useQuery({
    queryKey: ["geo", "zips"],
    queryFn: () => loadJson<FeatureCollection>("/geo/bexar-zips.json"),
    staleTime: Infinity,
  });
  const areaGeoQuery = useQuery({
    queryKey: ["geo", "areas"],
    queryFn: () => loadJson<FeatureCollection>("/geo/sapd-service-areas.json"),
    staleTime: Infinity,
  });

  const snapshotQuery = useQuery({
    queryKey: ["crime", range, against, group],
    queryFn: async () => {
      const snap = await getCrimeSnapshot({ data: { range, against, group } });
      if (!isCrimeSnapshot(snap)) throw new Error("Could not load SAPD reports.");
      return snap;
    },
    retry: 2,
  });

  const demandQuery = useQuery({
    queryKey: ["demand", range],
    queryFn: () => getDemandStats({ data: { range } }),
    staleTime: 10 * 60 * 1000,
  });

  const snapshot = useMemo(() => {
    const snap = snapshotQuery.data;
    const dem = demandQuery.data;
    if (!isCrimeSnapshot(snap)) return undefined;
    if (!dem || !Array.isArray(dem.byZip)) return snap;
    const cfsMap = new Map(dem.byZip.map((z) => [z.zip, z.n]));
    return {
      ...snap,
      cfsTotal: dem.cfsTotal,
      hours: dem.hours,
      weekdays: dem.weekdays,
      zips: snap.zips.map((z) => ({ ...z, cfs: cfsMap.get(z.zip) ?? 0 })),
    };
  }, [snapshotQuery.data, demandQuery.data]);

  const zipDetailQuery = useQuery({
    queryKey: ["zip-detail", selected?.kind === "zip" ? selected.id : null, range, against, group],
    queryFn: () =>
      getZipDetail({
        data: { range, against, group, zip: selected && selected.kind === "zip" ? selected.id : "00000" },
      }),
    enabled: selected?.kind === "zip",
  });

  const nameForReports =
    nameFilter || (!/^\d+$/.test(query.trim()) && query.trim().length >= 2 ? query.trim() : "");
  const [debouncedName, setDebouncedName] = useState(nameForReports);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedName(nameForReports), 280);
    return () => window.clearTimeout(timer);
  }, [nameForReports]);
  const reportsQuery = useQuery({
    queryKey: [
      "offense-reports",
      range,
      against,
      group,
      selected?.kind === "zip" ? selected.id : null,
      debouncedName.toLowerCase(),
    ],
    queryFn: () =>
      getOffenseReports({
        data: {
          range,
          against,
          group,
          zip: selected?.kind === "zip" ? selected.id : undefined,
          name: debouncedName,
        },
      }),
    staleTime: 60_000,
  });

  const liveQuery = useQuery({
    queryKey: [
      "live-dispatch",
      geo.status === "ready" ? geo.lat.toFixed(3) : null,
      geo.status === "ready" ? geo.lng.toFixed(3) : null,
    ],
    queryFn: async () => {
      const qs =
        geo.status === "ready"
          ? `?lat=${encodeURIComponent(String(geo.lat))}&lng=${encodeURIComponent(String(geo.lng))}`
          : "";
      try {
        const res = await fetch(`/api/live.json${qs}`, { cache: "no-store" });
        if (res.ok) {
          const feed: unknown = await res.json();
          if (isLiveFeed(feed)) return feed;
        }
      } catch {
        /* server function below */
      }
      try {
        const feed = await getLiveDispatch({
          data: geo.status === "ready" ? { lat: geo.lat, lng: geo.lng } : {},
        });
        if (isLiveFeed(feed) && feed.calls.length > 0) return feed;
      } catch {
        /* ignore */
      }
      throw new Error("Could not load the live dispatch board.");
    },
    refetchInterval: 45_000,
    staleTime: 20_000,
    retry: 2,
  });

  const dailyQuery = useQuery({
    queryKey: ["daily-dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/daily.json", { cache: "no-store" });
      const feed: unknown = await res.json();
      if (!isDailyFeed(feed)) throw new Error("Could not load yesterday’s dispatches.");
      if (!feed.calls.length && feed.error) throw new Error(feed.error);
      return feed;
    },
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });

  useEffect(() => {
    const feed = liveQuery.data;
    if (!isLiveFeed(feed) || !feed.calls) return;
    setSelectedCall((prev) => {
      if (!prev) return prev;
      const fresh = feed.calls.find((c) => c.id === prev.id) ?? feed.history.find((c) => c.id === prev.id);
      if (!fresh) return prev;
      return {
        ...fresh,
        lat: prev.lat ?? fresh.lat,
        lng: prev.lng ?? fresh.lng,
        geo: prev.geo ?? fresh.geo,
      };
    });
  }, [liveQuery.data]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") request();
      })
      .catch(() => undefined);
  }, [request]);

  useEffect(() => {
    if (geo.status !== "denied" && geo.status !== "error") return;
    toast(t("locate.deniedHint"));
    setMenu("more");
    setPanelOpen(false);
  }, [geo.status, t]);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") setNotifyBlocked(true);
  }, []);

  useEffect(() => {
    if (!notify && follow.length === 0) return;
    void registerAtlasAlerts(watch, follow);
  }, [notify, watch, follow]);

  const mergedHistory = useMemo(() => {
    return mergeHistory(liveQuery.data?.history ?? [], localHistory).filter(
      (c) => c.agency === "fire" || c.agency === "ems",
    );
  }, [liveQuery.data, localHistory]);

  useEffect(() => {
    const incoming = [...(liveQuery.data?.calls ?? []), ...(liveQuery.data?.history ?? [])].filter(
      (c) => c.agency === "fire" || c.agency === "ems",
    );
    if (!incoming.length) return;
    const merged = mergeHistory(localHistory, incoming).filter((c) => c.agency === "fire" || c.agency === "ems");
    saveLocalHistory(merged);
    if (merged.length !== localHistory.length) setLocalHistory(merged);
  }, [liveQuery.data, localHistory]);

  const digest = useMemo(() => {
    const pool = mergeHistory(mergedHistory, liveQuery.data?.calls ?? []);
    return digestCalls(pool, watch, overnightCutoff(digestAt));
  }, [mergedHistory, liveQuery.data, watch, digestAt]);

  const zipMeta = useMemo(() => {
    const map = new Map<string, { name: string; sqmi: number; households: number | null; income: number | null }>();
    for (const f of zipGeoQuery.data?.features ?? []) {
      const p = f.properties as ZipProps;
      map.set(String(p.ZIP), {
        name: p.PO_NAME,
        sqmi: Number(p.SQMI) || 0,
        households: p.TotalHouseholds ?? null,
        income: p.MedianIncome ?? null,
      });
    }
    return map;
  }, [zipGeoQuery.data]);

  const centroids = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const f of zipGeoQuery.data?.features ?? []) {
      const p = f.properties as ZipProps;
      const lat = parseCoord(p.Lat);
      const lng = parseCoord(p.Lng);
      if (lat == null || lng == null) continue;
      map.set(String(p.ZIP), { lat, lng });
    }
    return map;
  }, [zipGeoQuery.data]);

  const outside = geo.status === "ready" && !inBexar(geo.lat, geo.lng);

  const home: HomeZip | null = useMemo(() => {
    if (geo.status === "ready" && zipGeoQuery.data && !outside) {
      return locateInZips(geo.lat, geo.lng, zipGeoQuery.data);
    }
    const zip = watch[watch.length - 1]?.zip ?? (selected?.kind === "zip" ? selected.id : null);
    if (!zip) return null;
    const pt = centroids.get(zip);
    const meta = zipMeta.get(zip);
    if (!pt) return null;
    return { zip, name: meta?.name ?? "", lat: pt.lat, lng: pt.lng, miles: 0 };
  }, [geo, zipGeoQuery.data, outside, watch, selected, centroids, zipMeta]);

  const watchZips = useMemo(() => watch.map((w) => w.zip), [watch]);
  const homeZips = useMemo(() => {
    const set = new Set(watchZips);
    if (home?.zip) set.add(home.zip);
    return [...set];
  }, [watchZips, home]);

  const filteredCalls = useMemo(() => {
    let calls = liveQuery.data?.calls ?? [];
    if (agencyFilter !== "all") {
      calls = calls.filter((c) => (c.agency ?? "police") === agencyFilter);
    }
    if (sevFilter !== "all") calls = calls.filter((c) => c.severity === sevFilter);
    if (division !== "ALL") calls = calls.filter((c) => c.division === division);
    if (liveWindow !== "all") calls = calls.filter((c) => withinLiveWindow(c.whenMs, liveWindow));
    return calls;
  }, [liveQuery.data, agencyFilter, sevFilter, division, liveWindow]);

  const dailyBoard = useMemo((): DailyFeed | null => {
    const feed = dailyQuery.data;
    if (!isDailyFeed(feed)) return null;
    let calls = feed.calls;
    if (selected?.kind === "zip") calls = calls.filter((c) => c.zip === selected.id);
    if (agencyFilter !== "all") calls = calls.filter((c) => (c.agency ?? "police") === agencyFilter);
    if (sevFilter !== "all") calls = calls.filter((c) => c.severity === sevFilter);
    if (division !== "ALL") calls = calls.filter((c) => c.division === division);
    const police = calls.filter((c) => (c.agency ?? "police") === "police").length;
    const fire = calls.filter((c) => c.agency === "fire").length;
    const ems = calls.filter((c) => c.agency === "ems").length;
    return { ...feed, calls, total: calls.length, police, fire, ems };
  }, [dailyQuery.data, selected, agencyFilter, sevFilter, division]);

  const nearby = useMemo(() => {
    if (!liveQuery.data || !home) return [];
    const origin =
      geo.status === "ready" && !outside ? { lat: geo.lat, lng: geo.lng } : { lat: home.lat, lng: home.lng };
    let ranked = rankNearbyCalls(filteredCalls, origin, centroids, { maxMiles: 5, homeZips });
    const places = watch.filter((w) => w.address);
    if (places.length) {
      const ids = new Set(ranked.map((c) => c.id));
      for (const c of filteredCalls) {
        if (ids.has(c.id)) continue;
        if (places.some((p) => placeMatches(c, p))) {
          ranked.push({ ...c, miles: 0 });
          ids.add(c.id);
        }
      }
    }
    if (priorityNear) ranked = ranked.filter((c) => c.severity === "high");
    return ranked;
  }, [liveQuery.data, filteredCalls, home, outside, geo, centroids, homeZips, priorityNear, watch]);

  const nearbyIds = useMemo(() => new Set(nearby.map((c) => c.id)), [nearby]);
  const citywide = useMemo(() => {
    const calls = priorityNear ? filteredCalls.filter((c) => c.severity === "high") : filteredCalls;
    if (!home || outside) return calls;
    return calls.filter((c) => !nearbyIds.has(c.id));
  }, [filteredCalls, home, outside, nearbyIds, priorityNear]);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    for (const c of liveQuery.data?.calls ?? []) {
      if (c.division) set.add(c.division);
    }
    return [...set].sort();
  }, [liveQuery.data]);

  const selectedStat = selected?.kind === "zip" ? (snapshot?.zips.find((z) => z.zip === selected.id) ?? null) : null;
  const selectedMeta = selected?.kind === "zip" ? (zipMeta.get(selected.id) ?? null) : null;

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const places = PLACE_ZIPS.filter((p) => p.q.includes(q) || p.name.toLowerCase().includes(q) || p.zip.includes(q))
      .slice(0, 3)
      .map((p) => ({ kind: "zip" as const, zip: p.zip, name: p.name }));
    const placeZips = new Set(places.map((p) => p.zip));
    const zips = (zipGeoQuery.data?.features ?? [])
      .map((f) => f.properties as ZipProps)
      .filter((p) => String(p.ZIP).includes(q) || p.PO_NAME.toLowerCase().includes(q))
      .filter((p) => !placeZips.has(String(p.ZIP)))
      .slice(0, 5)
      .map((p) => ({ kind: "zip" as const, zip: String(p.ZIP), name: p.PO_NAME }));
    const groups = NIBRS_GROUPS.filter((g) => {
      const short = (GROUP_SHORT[g] ?? g).toLowerCase();
      return g.toLowerCase().includes(q) || short.includes(q);
    })
      .slice(0, 3)
      .map((g) => ({ kind: "group" as const, id: g, name: GROUP_SHORT[g] ?? g }));
    const offenses = (reportsQuery.data?.names ?? [])
      .filter((n) => n.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((n) => ({ kind: "offense" as const, name: n.name, n: n.n }));
    const livePool = [...(liveQuery.data?.calls ?? []), ...mergedHistory];
    const liveSeen = new Set<string>();
    const live = livePool
      .filter((c) => {
        if (liveSeen.has(c.id)) return false;
        const hit =
          c.problem.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.street.toLowerCase().includes(q) ||
          c.division.toLowerCase().includes(q) ||
          (c.agency ?? "").includes(q) ||
          (q === "fire" && c.agency === "fire") ||
          (q === "ems" && c.agency === "ems") ||
          q === "72";
        if (hit) liveSeen.add(c.id);
        return hit;
      })
      .slice(0, 5)
      .map((c) => ({
        kind: "live" as const,
        id: c.id,
        problem: c.problem,
        zip: c.zip,
        address: c.address,
        street: c.street,
        lat: c.lat,
        lng: c.lng,
      }));
    const streets = new Map<string, { kind: "street"; street: string; zip: string; lat?: number; lng?: number }>();
    for (const c of liveQuery.data?.calls ?? []) {
      if (!c.street || !c.street.toLowerCase().includes(q)) continue;
      if (!streets.has(c.street)) {
        streets.set(c.street, { kind: "street", street: c.street, zip: c.zip, lat: c.lat, lng: c.lng });
      }
      if (streets.size >= 4) break;
    }
    return [...places, ...groups, ...zips, ...[...streets.values()], ...offenses, ...live];
  }, [query, zipGeoQuery.data, reportsQuery.data, liveQuery.data, mergedHistory]);

  const legendValues = useMemo(() => {
    if (!snapshot) return [];
    if (geography === "zip") {
      const values = snapshot.zips.map((z) => {
        const sq = zipMeta.get(z.zip)?.sqmi ?? 0;
        if (metric === "density" && sq > 0) return z.n / sq;
        if (metric === "spike") return z.prev > 0 ? z.n / z.prev : 0;
        return z.n;
      });
      return quantileBreaks(values);
    }
    const areaSq = new Map<string, number>();
    for (const f of areaGeoQuery.data?.features ?? []) {
      const p = f.properties as { SUBSTN?: string; SqMiles?: number };
      areaSq.set(String(p.SUBSTN).toUpperCase(), Number(p.SqMiles) || 0);
    }
    return quantileBreaks(
      snapshot.areas.map((a) => {
        const sq = areaSq.get(a.name.toUpperCase()) ?? 0;
        if (metric === "density" && sq > 0) return a.n / sq;
        if (metric === "spike") return 0;
        return a.n;
      }),
    );
  }, [snapshot, geography, metric, zipMeta, areaGeoQuery.data]);

  const err =
    snapshotQuery.error instanceof Error
      ? snapshotQuery.error.message
      : snapshotQuery.error
        ? "Could not load SAPD data."
        : null;
  const liveErr =
    liveQuery.data?.error ??
    (liveQuery.error instanceof Error
      ? liveQuery.error.message
      : liveQuery.error
        ? "Could not load the live dispatch board."
        : null);

  const seenHigh = useRef(new Set<string>());
  const primed = useRef(false);
  const lastHomeZip = useRef<string | null>(null);
  useEffect(() => {
    if (!home || !liveQuery.data) return;
    if (lastHomeZip.current !== home.zip) {
      lastHomeZip.current = home.zip;
      primed.current = false;
    }
    const watchedSet = new Set(homeZips);
    const fresh = (liveQuery.data.calls ?? [])
      .filter((c) => c.severity === "high" && (watchedSet.has(c.zip) || watch.some((w) => placeMatches(c, w))))
      .filter((c) => !seenHigh.current.has(c.id));
    for (const c of fresh) seenHigh.current.add(c.id);
    if (!primed.current) {
      primed.current = true;
      if (nearby.length > 0) {
        toast(t("notify.toastNear", {
          n: nearby.length,
          calls: nearby.length === 1 ? t("live.call") : t("live.calls"),
          zip: home.zip,
        }), { description: home.name });
      }
      return;
    }
    if (fresh.length === 1) {
      const c = fresh[0]!;
      toast(c.problem, { description: [c.address, c.zip].filter(Boolean).join(" · ") });
      if (notify) notifyCalls([c], locale);
    } else if (fresh.length > 1) {
      toast(t("notify.toastFresh", { n: fresh.length }));
      if (notify) notifyCalls(fresh, locale);
    }
  }, [home, liveQuery.data, nearby, homeZips, notify, locale, t, watch]);

  const primedFollow = useRef(false);
  useEffect(() => {
    const calls = liveQuery.data?.calls ?? [];
    if (!liveQuery.data) return;
    if (!primedFollow.current) {
      primedFollow.current = true;
      for (const f of follow) {
        if (f.kind !== "call") continue;
        const c = calls.find((x) => x.id === f.id);
        if (c) markFollow(f.id, { fingerprint: callFingerprint(c), status: "open" });
      }
      return;
    }
    const diffs = diffFollowedCalls(follow, calls);
    for (const d of diffs) {
      if (d.kind === "cleared") {
        markFollow(d.id, { status: "cleared", clearedAt: Date.now() });
        toast(t("follow.toastCleared", { title: d.title }), { description: d.body });
        notifyFollow(t("follow.cleared"), `${d.title} · ${d.body}`, `cleared:${d.id}`);
      } else {
        const c = calls.find((x) => x.id === d.id);
        if (c) markFollow(d.id, { fingerprint: callFingerprint(c), title: c.problem, subtitle: d.body });
        toast(d.title, { description: d.body });
        notifyFollow(d.title, d.body, `upd:${d.id}`);
      }
    }
  }, [liveQuery.data, follow, markFollow, t]);

  useEffect(() => {
    const reports = reportsQuery.data?.reports ?? [];
    if (!reports.length) return;
    for (const f of follow) {
      if (f.kind !== "report" || f.status === "cleared") continue;
      const r = reports.find((x) => x.id === f.id);
      if (!r) continue;
      const fp = reportFingerprint(r);
      if (fp === f.fingerprint) continue;
      markFollow(f.id, {
        fingerprint: fp,
        title: r.codeName,
        subtitle: [r.zip, r.area].filter(Boolean).join(" · "),
      });
      toast(r.codeName, { description: r.zip });
      notifyFollow(r.codeName, r.zip, `rep:${r.id}`);
    }
  }, [reportsQuery.data, follow, markFollow]);

  function selectZip(zip: string) {
    setSelected({ kind: "zip", id: zip });
    setGeography("zip");
    setPanelOpen(true);
    setSelectedCall(null);
  }

  function locate() {
    if (geo.status === "denied") {
      toast(t("locate.deniedHint"));
      setMenu("more");
      return;
    }
    setTab("live");
    setPanelOpen(true);
    request();
  }

  const onSelectMap = useCallback((sel: MapSelection) => {
    setSelected(sel);
    setPanelOpen(true);
  }, []);

  const onSelectCall = useCallback(
    (call: LiveCall) => {
      let next = call;
      if (call.lat == null || call.lng == null) {
        const z = call.zip ? centroids.get(call.zip) : undefined;
        next = z ? { ...call, lat: z.lat, lng: z.lng, geo: "zip" } : { ...call, geo: call.geo ?? "none" };
      } else if (!call.geo) {
        next = { ...call, geo: "block" };
      }
      setSelectedCall(next);
      setTab("live");
      setPanelOpen(true);
      if (call.zip) {
        setSelected({ kind: "zip", id: call.zip });
        setGeography("zip");
      }
    },
    [centroids],
  );

  async function toggleNotify() {
    if (notify) {
      setNotify(false);
      return;
    }
    const ok = await requestQuietAlerts();
    if (!ok) {
      setNotifyBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
      toast(t("notify.blocked"));
      return;
    }
    setNotify(true);
    void registerAtlasAlerts(watch);
    toast(t("notify.enabled"), { description: t("notify.hint") });
  }

  function addPlace(call: LiveCall) {
    addWatch({
      zip: call.zip,
      name: call.address,
      address: call.address,
      street: call.street,
    });
    toast(t("watch.watchingPlace"), { description: call.address });
  }

  async function share() {
    const zip = selected?.kind === "zip" ? selected.id : (home?.zip ?? "78205");
    const name = selectedMeta?.name ?? home?.name ?? "San Antonio";
    const url = `${window.location.origin}/?mode=${tab === "stats" ? "reports" : "live"}&zip=${zip}&range=${range}&lang=${locale}${against !== "ALL" ? `&against=${against}` : ""}${group !== "ALL" ? `&group=${encodeURIComponent(group)}` : ""}`;
    const reports = selectedStat?.n ?? snapshot?.total ?? 0;
    const cfs =
      selected?.kind === "zip" ? (zipDetailQuery.data?.cfs ?? selectedStat?.cfs ?? 0) : (snapshot?.cfsTotal ?? 0);
    const ratio = selectedStat
      ? spikeRatio(selectedStat.n, selectedStat.prev)
      : spikeRatio(snapshot?.total ?? 0, snapshot?.previousTotal ?? 0);
    const spike = ratio != null ? t("stats.spike", { x: formatSpike(ratio) }) : t("stats.spikeUsual");
    const liveN = (liveQuery.data?.calls ?? []).filter((c) => !selected?.id || c.zip === zip).length;
    const text = t("share.text", {
      zip,
      name,
      reports: formatNumber(reports),
      range: t(`range.${range}`),
      spike,
      cfs: formatNumber(cfs),
      live: formatNumber(liveN),
      url,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: "Alamo Atlas", text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t("share.copied"));
    } catch {
      toast(t("share.failed"));
    }
  }

  function downloadReport() {
    toast(t("pdf.working"));
    void (async () => {
      try {
        let feed = dailyQuery.data;
        if (!isDailyFeed(feed) || !feed.calls.length) {
          const next = await dailyQuery.refetch();
          feed = next.data;
        }
        if (!isDailyFeed(feed) || !feed.calls.length) {
          toast(t("daily.empty"));
          return;
        }
        await dailyDispatchPdf({
          feed,
          zip: selected?.kind === "zip" ? selected.id : undefined,
          name: selectedMeta?.name ?? "San Antonio",
          zipGeo: zipGeoQuery.data ?? null,
        });
        toast(t("pdf.done"));
      } catch {
        toast(t("pdf.fail"));
      }
    })();
  }

  const locateLabel =
    geo.status === "asking"
      ? t("locate.asking")
      : geo.status === "ready"
        ? t("locate.ready")
        : geo.status === "denied"
          ? t("locate.denied")
          : t("locate.idle");

  const liveCount = showYesterday
    ? (dailyBoard?.total ?? 0)
    : showHistory
      ? mergedHistory.length
      : (liveQuery.data?.calls?.length ?? 0);
  const watchingSelected = selected?.kind === "zip" && watchZips.includes(selected.id);
  const filtersActive =
    tab === "live"
      ? agencyFilter !== "all" ||
        showHistory ||
        showYesterday ||
        liveWindow !== "all" ||
        sevFilter !== "all" ||
        priorityNear ||
        division !== "ALL"
      : range !== "ytd" || against !== "ALL" || group !== "ALL" || geography !== "zip" || metric !== "count";

  const focus = useMemo(() => {
    if (!selectedCall || selectedCall.lat == null || selectedCall.lng == null) return null;
    return { lat: selectedCall.lat, lng: selectedCall.lng, zoom: selectedCall.geo === "zip" ? 12 : 15 };
  }, [selectedCall]);

  const userPos = useMemo(
    () => (geo.status === "ready" ? { lat: geo.lat, lng: geo.lng } : null),
    [geo],
  );

  const historyFiltered = useMemo(() => {
    let calls = mergedHistory;
    if (agencyFilter !== "all") {
      calls = calls.filter((c) => (c.agency ?? "police") === agencyFilter);
    }
    if (sevFilter !== "all") calls = calls.filter((c) => c.severity === sevFilter);
    if (division !== "ALL") calls = calls.filter((c) => c.division === division);
    if (liveWindow !== "all") calls = calls.filter((c) => withinLiveWindow(c.whenMs, liveWindow));
    return calls;
  }, [mergedHistory, agencyFilter, sevFilter, division, liveWindow]);

  const mapCalls = useMemo(() => {
    if (showHistory) return historyFiltered;
    if (priorityNear) return nearby;
    return filteredCalls;
  }, [showHistory, historyFiltered, priorityNear, nearby, filteredCalls]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <div className="absolute inset-0 z-0 isolate">
        <CrimeMap
          zipGeo={zipGeoQuery.data ?? null}
          areaGeo={areaGeoQuery.data ?? null}
          zips={snapshot?.zips ?? EMPTY_ZIPS}
          areas={snapshot?.areas ?? EMPTY_AREAS}
          geography={geography}
          metric={metric}
          selected={selected}
          onSelect={onSelectMap}
          user={userPos}
          homeZip={home?.zip ?? null}
          watchZips={watchZips}
          liveCalls={mapCalls}
          selectedCallId={selectedCall?.id ?? null}
          onSelectCall={onSelectCall}
          focus={focus}
          showHeat={tab === "stats"}
          showLive={tab === "live"}
          onHoverZip={setHoverZip}
        />
      </div>

      <AppTopBar
        liveCount={liveCount}
        liveLabel={
          showYesterday
            ? t("daily.onBar", { n: liveCount })
            : liveCount != null
              ? t("live.onScene", { n: liveCount })
              : t("live.board")
        }
        searchOpen={menu === "search"}
        onSearch={() => {
          setMenu((m) => (m === "search" ? null : "search"));
          setPanelOpen(false);
        }}
      />
      <div className="pointer-events-none absolute left-3 z-20 atlas-fab flex flex-col items-start gap-2">
        {tab === "stats" ? (
          <div className="pointer-events-auto rounded-md border border-border bg-bg/80 px-3 py-2 shadow-float backdrop-blur-md">
            <p className="atlas-kicker">
              {metric === "density"
                ? t("metric.legendDensity")
                : metric === "spike"
                  ? t("metric.legendSpike")
                  : t("metric.legendCount")}
            </p>
            <p className="mt-1 max-w-[11rem] text-xs leading-snug text-subtle">
              {selected?.kind === "zip" || hoverZip
                ? t("metric.legendHint", { range: t(`range.${range}`) })
                : t("metric.legendHintCity", { range: t(`range.${range}`) })}
            </p>
            {hoverZip || (selected?.kind === "zip" ? selected.id : null) ? (
              <p className="mt-1 text-xs tabular-nums text-fg">
                {hoverZip || (selected?.kind === "zip" ? selected.id : "")}
                {selectedStat && selected?.kind === "zip" && !hoverZip
                  ? ` · ${formatNumber(selectedStat.n)}`
                  : ""}
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-0.5">
              {HEAT.map((c, i) => (
                <span
                  key={c}
                  className="h-2 w-7 first:rounded-l-full last:rounded-r-full"
                  style={{ background: c }}
                  title={`Bin ${i + 1}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs tabular-nums text-subtle">
              <span>{t("metric.lower")}</span>
              <span>
                {legendValues.length
                  ? metric === "spike"
                    ? `${(legendValues[legendValues.length - 1] ?? 0).toFixed(1)}×`
                    : Math.round(legendValues[legendValues.length - 1] ?? 0)
                  : ""}
              </span>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto hidden rounded-md border border-border bg-bg/80 px-2.5 py-2 text-xs text-muted shadow-float backdrop-blur-sm md:block">
            <p className="atlas-kicker mb-1">{t("live.legend")}</p>
            <p className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" /> {t("agency.police")}</p>
            <p className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-fire" /> {t("agency.fire")}</p>
            <p className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ems" /> {t("agency.ems")}</p>
            <p className="mt-1 text-xs text-subtle">{t("call.geoZip")}</p>
          </div>
        )}
        <LocateFab
          onClick={locate}
          locating={geo.status === "asking"}
          ready={geo.status === "ready"}
          label={locateLabel}
        />
      </div>

      <aside
        data-open={panelOpen}
        className="atlas-sheet pointer-events-auto fixed inset-x-0 z-30 flex flex-col overflow-hidden rounded-t-xl border border-border bg-surface/96 shadow-float backdrop-blur-md"
      >
        <div className="relative flex h-12 min-h-12 w-full shrink-0 items-center gap-0.5 px-1">
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong" />
          <button
            type="button"
            className="mt-1 min-h-11 min-w-0 flex-1 truncate px-3 text-left text-sm font-medium"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? t("panel.collapse") : t("panel.expand")}
          >
            {tab === "live"
              ? liveCount != null
                ? t("live.onScene", { n: liveCount })
                : t("live.board")
              : snapshot?.to &&
                  Math.floor((Date.now() - Date.parse(`${snapshot.to}T12:00:00`)) / 86_400_000) >= 2
                ? t("reports.delayed", {
                    n: Math.floor((Date.now() - Date.parse(`${snapshot.to}T12:00:00`)) / 86_400_000),
                  })
                : t("tab.reports")}
          </button>
          <Hint
            className="mt-1"
            side="top"
            title={tab === "live" ? t("tab.live") : t("tab.reports")}
            body={tab === "live" ? t("hint.live") : t("hint.reports")}
          />
          <button
            type="button"
            className="mt-1 flex size-11 shrink-0 items-center justify-center"
            onClick={() => setPanelOpen((v) => !v)}
            aria-hidden
            tabIndex={-1}
          >
            <ChevronDown
              className={cn(
                "size-4 text-muted transition-transform duration-150 ease-[var(--ease-out)]",
                panelOpen && "rotate-180",
              )}
            />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {panelOpen ? (
            tab === "live" ? (
            <AlertsFeed
              feed={liveQuery.data}
              loading={liveQuery.isLoading}
              error={liveErr}
              onRetry={() => liveQuery.refetch()}
              home={outside && watch.length === 0 ? null : home}
              nearby={nearby}
              citywide={citywide}
              outside={outside && watch.length === 0}
              onSelectCall={onSelectCall}
              selectedCallId={selectedCall?.id ?? null}
              selectedCall={selectedCall}
              onClearCall={() => setSelectedCall(null)}
              nameQuery={!/^\d+$/.test(query.trim()) ? query.trim() : ""}
              watch={watch}
              onAddWatch={(zip) => addWatch({ zip, name: zipMeta.get(zip)?.name ?? "" })}
              onRemoveWatch={removeWatch}
              history={historyFiltered}
              digest={digest}
              stale={Boolean(liveQuery.data?.stale)}
              showHistory={showHistory}
              showYesterday={showYesterday}
              yesterday={dailyBoard}
              yesterdayLoading={dailyQuery.isLoading}
              yesterdayError={
                dailyQuery.error instanceof Error
                  ? dailyQuery.error.message
                  : dailyQuery.error
                    ? "Could not load yesterday’s dispatches."
                    : null
              }
              onRetryYesterday={() => dailyQuery.refetch()}
              onAddPlace={addPlace}
              onDismissDigest={markDigest}
            />
          ) : (
            <StatsPanel
              snapshot={snapshot}
              loading={snapshotQuery.isLoading}
              error={err}
              onRetry={() => snapshotQuery.refetch()}
              selected={selected}
              selectedMeta={selectedMeta}
              selectedStat={selectedStat}
              zipDetail={zipDetailQuery.data}
              zipDetailLoading={zipDetailQuery.isFetching}
              reports={reportsQuery.data}
              reportsLoading={reportsQuery.isFetching}
              nameFilter={nameFilter}
              onClearName={() => setNameFilter("")}
              onSelectZip={(zip) => {
                selectZip(zip);
                addWatch({ zip, name: zipMeta.get(zip)?.name ?? "" });
              }}
              onClear={() => setSelected(null)}
              onPickName={(name) => {
                setNameFilter(name);
                setTab("stats");
                setPanelOpen(true);
              }}
              watching={watchingSelected}
              onToggleWatch={() => {
                if (!selected || selected.kind !== "zip") return;
                if (watchingSelected) removeWatch(selected.id);
                else addWatch({ zip: selected.id, name: selectedMeta?.name ?? "" });
              }}
            />
          )
          ) : null}
        </div>
      </aside>

      <AppDock
        tab={tab}
        liveCount={liveCount}
        menu={menu}
        filtersActive={filtersActive}
        onLive={() => {
          setMenu(null);
          if (tab === "live" && panelOpen) setPanelOpen(false);
          else {
            setTab("live");
            setPanelOpen(true);
          }
        }}
        onReports={() => {
          setMenu(null);
          if (tab === "stats" && panelOpen) setPanelOpen(false);
          else {
            setTab("stats");
            setPanelOpen(true);
          }
        }}
        onFilters={() => {
          setMenu((m) => (m === "filters" ? null : "filters"));
          setPanelOpen(false);
        }}
        onMore={() => {
          setMenu((m) => (m === "more" ? null : "more"));
          setPanelOpen(false);
        }}
      />
      <FiltersRoll
        open={menu === "filters"}
        onOpenChange={(open) => setMenu(open ? "filters" : null)}
        tab={tab}
        agencyFilter={agencyFilter}
        onAgencyFilter={setAgencyFilter}
        showHistory={showHistory}
        onShowHistory={(v) => {
          setShowHistory(v);
          if (v) setShowYesterday(false);
        }}
        showYesterday={showYesterday}
        onShowYesterday={(v) => {
          setShowYesterday(v);
          if (v) {
            setShowHistory(false);
            setTab("live");
            setPanelOpen(true);
          }
        }}
        liveWindow={liveWindow}
        onLiveWindow={setLiveWindow}
        sevFilter={sevFilter}
        onSevFilter={setSevFilter}
        priorityNear={priorityNear}
        onPriorityNear={setPriorityNear}
        division={division}
        onDivision={setDivision}
        divisions={divisions}
        range={range}
        onRange={setRange}
        against={against}
        onAgainst={setAgainst}
        group={group}
        onGroup={setGroup}
        geography={geography}
        onGeography={(g) => {
          setGeography(g);
          setSelected(null);
        }}
        metric={metric}
        onMetric={setMetric}
      />
      <MoreRoll
        open={menu === "more"}
        onOpenChange={(open) => setMenu(open ? "more" : null)}
        locale={locale}
        onLocale={setLocale}
        notify={notify}
        notifyBlocked={notifyBlocked}
        onNotify={toggleNotify}
        watch={watch}
        onSelectZip={(zip) => {
          selectZip(zip);
          setMenu(null);
          setTab("live");
          setPanelOpen(true);
        }}
        onRemoveWatch={removeWatch}
        follow={follow}
        onRemoveFollow={removeFollow}
        onOpenFollow={(item) => {
          setMenu(null);
          if (item.kind === "call") {
            const c =
              (liveQuery.data?.calls ?? []).find((x) => x.id === item.id) ??
              (dailyBoard?.calls ?? []).find((x) => x.id === item.id);
            if (c) onSelectCall(c);
            setTab("live");
            setPanelOpen(true);
            return;
          }
          setTab("stats");
          setPanelOpen(true);
        }}
        onPdf={() => {
          downloadReport();
          setMenu(null);
        }}
        onCsv={() => {
          const run = async () => {
            let feed = dailyQuery.data;
            if (!isDailyFeed(feed) || !feed.calls.length) {
              const next = await dailyQuery.refetch();
              feed = next.data;
            }
            if (!isDailyFeed(feed) || !feed.calls.length) {
              toast(t("daily.empty"));
              return;
            }
            dailyCsv(feed, selected?.kind === "zip" ? selected.id : undefined);
            toast(t("csv.done"));
          };
          void run();
          setMenu(null);
        }}
        onShare={() => {
          void share();
        }}
        onLocate={() => {
          locate();
          setMenu(null);
        }}
        locateLabel={locateLabel}
        onHowTo={() => {
          setHowToStart(0);
          setHowToReplay(true);
          setHowToSessionSkip(false);
        }}
        onContact={() => {
          setHowToStart(HOWTO_CONTACT);
          setHowToReplay(true);
          setHowToSessionSkip(false);
        }}
      />
      <SearchRoll
        open={menu === "search"}
        onOpenChange={(open) => setMenu(open ? "search" : null)}
        query={query}
        onQuery={setQuery}
        hits={searchHits as SearchHit[]}
        onPick={(hit) => {
          if (hit.kind === "zip") {
            selectZip(hit.zip);
            setTab("live");
          } else if (hit.kind === "group") {
            setGroup(hit.id);
            setNameFilter("");
            setTab("stats");
            setPanelOpen(true);
          } else if (hit.kind === "offense") {
            setSelected(null);
            setNameFilter(hit.name);
            setTab("stats");
            setPanelOpen(true);
          } else if (hit.kind === "street") {
            if (hit.zip) selectZip(hit.zip);
            const match = (liveQuery.data?.calls ?? []).find((c) => c.street === hit.street);
            if (match) onSelectCall(match);
            setTab("live");
            setPanelOpen(true);
          } else {
            const match = (liveQuery.data?.calls ?? []).find((c) => c.id === hit.id);
            if (match) onSelectCall(match);
            else if (hit.zip) selectZip(hit.zip);
            setTab("live");
            setPanelOpen(true);
          }
          setQuery("");
          setMenu(null);
        }}
      />
      <StartScreen
        open={hydrated && !seenIntro}
        onLocate={() => {
          dismissIntro();
          locate();
        }}
        onSaveZip={(zip) => {
          addWatch({ zip, name: zipMeta.get(zip)?.name ?? "" });
          selectZip(zip);
          dismissIntro();
        }}
        onSkip={() => {
          dismissIntro();
        }}
      />
      <HowTo
        open={
          howToReplay ||
          (hydrated && seenIntro && !seenHowTo && !howToSessionSkip)
        }
        startAt={howToStart}
        onSkipNow={() => {
          setHowToReplay(false);
          setHowToSessionSkip(true);
        }}
        onSkipNext={() => {
          dismissHowTo();
          setHowToReplay(false);
          setHowToSessionSkip(true);
        }}
        onLocate={() => {
          dismissHowTo();
          setHowToReplay(false);
          setHowToSessionSkip(true);
          locate();
        }}
        onSaveZip={(zip) => {
          addWatch({ zip, name: zipMeta.get(zip)?.name ?? "" });
          selectZip(zip);
          dismissHowTo();
          setHowToReplay(false);
          setHowToSessionSkip(true);
        }}
      />
      <LoadingScreen
        open={
          hydrated &&
          seenIntro &&
          (seenHowTo || howToSessionSkip) &&
          !howToReplay &&
          ((tab === "live" && liveQuery.isLoading && !liveQuery.data) ||
            (tab === "stats" && snapshotQuery.isLoading && !snapshotQuery.data))
        }
        progressLabel={
          tab === "stats" ? t("loading.reports") : t("loading.board")
        }
      />
    </main>
  );
}
