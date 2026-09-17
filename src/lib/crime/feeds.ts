import { CFS_RESOURCE, CKAN_RESOURCE, CKAN_SQL, OFFENSE_RESOURCE } from "./constants.ts";

export const ATLAS_UA = "AlamoAtlas/1.0 (San Antonio public-safety map)";

export type FeedKind = "html" | "arcgis" | "ckan" | "tacc" | "nws";
export type FeedRole = "live" | "yesterday" | "reports" | "demand" | "weather" | "history";
export type FeedOwner = "SAPD" | "SAFD" | "TACC" | "NWS" | "COSA";
export type FeedGeo = "block" | "point" | "zip" | "none";

export type FeedDef = {
  id: string;
  role: FeedRole;
  kind: FeedKind;
  url: string;
  ttlMs: number;
  timeoutMs: number;
  owner: FeedOwner;
  geo: FeedGeo;
  honesty: string;
};

export const ARCGIS_CFS_7DAY =
  "https://services.arcgis.com/g1fRTDLeMgspWrYp/ArcGIS/rest/services/CFS_SAPD_7Days/FeatureServer/0/query";

export const TACC_FIRE_DAY = (y: string, m: string, d: string) =>
  `https://smartcity.tacc.utexas.edu/fire/api/v1/SanAntonio/${y}/${m}/${d}/FireMap.json`;

export const FEEDS = {
  sapdCadHtml: {
    id: "sapd-cad-html",
    role: "live",
    kind: "html",
    url: "https://webapp3.sanantonio.gov/policecalls/Calls.aspx",
    ttlMs: 30_000,
    timeoutMs: 12_000,
    owner: "SAPD",
    geo: "block",
    honesty: "As called in. Not a confirmed crime.",
  },
  safdFireHtml: {
    id: "safd-fire-html",
    role: "live",
    kind: "html",
    url: "https://webapp3.sanantonio.gov/activefire/Fire.aspx",
    ttlMs: 30_000,
    timeoutMs: 12_000,
    owner: "SAFD",
    geo: "block",
    honesty: "Fire board. Not an investigation result.",
  },
  safdEmsHtml: {
    id: "safd-ems-html",
    role: "live",
    kind: "html",
    url: "https://webapp3.sanantonio.gov/activefire/EMS.aspx",
    ttlMs: 30_000,
    timeoutMs: 12_000,
    owner: "SAFD",
    geo: "block",
    honesty: "EMS board.",
  },
  safd72Html: {
    id: "safd-72-html",
    role: "history",
    kind: "html",
    url: "https://webapp3.sanantonio.gov/activefire/SAFDDisplay.aspx",
    ttlMs: 10 * 60_000,
    timeoutMs: 12_000,
    owner: "SAFD",
    geo: "block",
    honesty: "Official 72h fire display.",
  },
  sapdCfs7d: {
    id: "sapd-cfs-7d",
    role: "live",
    kind: "arcgis",
    url: ARCGIS_CFS_7DAY,
    ttlMs: 45_000,
    timeoutMs: 20_000,
    owner: "SAPD",
    geo: "block",
    honesty: "Call for service. As called in.",
  },
  taccFire: {
    id: "tacc-fire",
    role: "live",
    kind: "tacc",
    url: "https://smartcity.tacc.utexas.edu/fire/api/v1/SanAntonio/{YYYY}/{MM}/{DD}/FireMap.json",
    ttlMs: 10 * 60_000,
    timeoutMs: 8_000,
    owner: "TACC",
    geo: "block",
    honesty: "TACC fire map.",
  },
  ckanCfs: {
    id: "ckan-cfs",
    role: "demand",
    kind: "ckan",
    url: `${CKAN_RESOURCE}?id=${CFS_RESOURCE}`,
    ttlMs: 60 * 60_000,
    timeoutMs: 20_000,
    owner: "COSA",
    geo: "zip",
    honesty: "Historical CFS. No pin.",
  },
  ckanOffenses: {
    id: "ckan-offenses",
    role: "reports",
    kind: "ckan",
    url: `${CKAN_RESOURCE}?id=${OFFENSE_RESOURCE}`,
    ttlMs: 60 * 60_000,
    timeoutMs: 20_000,
    owner: "COSA",
    geo: "zip",
    honesty: "Written report. Not an arrest. ZIP only.",
  },
  nwsBexar: {
    id: "nws-bexar",
    role: "weather",
    kind: "nws",
    url: "https://api.weather.gov/alerts/active?zone=TXC029",
    ttlMs: 5 * 60_000,
    timeoutMs: 8_000,
    owner: "NWS",
    geo: "none",
    honesty: "Weather alert.",
  },
} as const satisfies Record<string, FeedDef>;

export type FeedId = keyof typeof FEEDS;

export const FEED_LIST: FeedDef[] = Object.values(FEEDS);

export function feedById(id: string): FeedDef | undefined {
  return FEED_LIST.find((f) => f.id === id);
}

export function feedsForRole(role: FeedRole): FeedDef[] {
  return FEED_LIST.filter((f) => f.role === role);
}

export const CKAN_SQL_URL = CKAN_SQL;
export const CKAN_RESOURCE_URL = CKAN_RESOURCE;
