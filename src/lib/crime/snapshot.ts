import { createServerFn } from "@tanstack/react-start";
import {
  AGAINST,
  CFS_RESOURCE,
  CKAN_RESOURCE,
  CKAN_SQL,
  DOW_ORDER,
  NIBRS_GROUPS,
  OFFENSE_RESOURCE,
  RANGES,
  type AgainstId,
  type RangeId,
} from "./constants";
import { cachedAlmanac } from "./almanac-cache";
import type {
  CrimeQuery,
  CrimeSnapshot,
  DailyPoint,
  DemandStats,
  DowPoint,
  HourPoint,
  NamedCount,
  OffenseList,
  ZipDetail,
  ZipStat,
} from "./types";

const TTL_MS = 10 * 60 * 1000;

function cached<T>(key: string, load: () => Promise<T>, validate?: (value: unknown) => value is T): Promise<T> {
  return cachedAlmanac({ key, ttlMs: TTL_MS, source: "open-data-sa", load, validate });
}

function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isRange(v: string): v is RangeId {
  return RANGES.some((r) => r.id === v);
}
function isAgainst(v: string): v is AgainstId {
  return AGAINST.some((a) => a.id === v);
}
function isGroup(v: string): boolean {
  return v === "ALL" || (NIBRS_GROUPS as readonly string[]).includes(v);
}

function parseQuery(input: CrimeQuery): CrimeQuery {
  const range = isRange(input.range) ? input.range : "ytd";
  const against = isAgainst(input.against) ? input.against : "ALL";
  const group = isGroup(input.group) ? input.group : "ALL";
  return { range, against, group };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function windowFor(maxDate: string, range: RangeId) {
  const to = maxDate;
  let from: string;
  if (range === "30d") from = addDays(to, -29);
  else if (range === "90d") from = addDays(to, -89);
  else if (range === "12m") from = addDays(to, -364);
  else from = `${to.slice(0, 4)}-01-01`;

  const days = Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -days);
  return { from, to, prevFrom, prevTo };
}

function whereClause(from: string, to: string, against: AgainstId, group: string): string {
  const parts = [`"Report_Date" >= ${sqlStr(from)}`, `"Report_Date" <= ${sqlStr(to)}`];
  if (against !== "ALL") parts.push(`"NIBRS_Crime_Against" = ${sqlStr(against)}`);
  if (group !== "ALL") parts.push(`"NIBRS_Group" = ${sqlStr(group)}`);
  return parts.join(" AND ");
}

function cfsWhere(from: string, to: string): string {
  return `"Response_Date" >= ${sqlStr(from)} AND "Response_Date" < ${sqlStr(addDays(to, 1))}`;
}

type CkanSqlResponse = {
  success: boolean;
  error?: { message?: string };
  result?: { records?: Array<Record<string, unknown>> };
};

async function ckanSql(sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(CKAN_SQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "AlamoAtlas/1.0 (San Antonio public-safety map)",
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Open Data SA returned ${res.status}`);
  const json = (await res.json()) as CkanSqlResponse;
  if (!json.success) throw new Error(json.error?.message ?? "Open Data SA query failed");
  return json.result?.records ?? [];
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function padZip(v: unknown): string {
  return str(v).replace(/\D/g, "").padStart(5, "0").slice(-5);
}

async function resourceModified(): Promise<string | null> {
  try {
    const url = `${CKAN_RESOURCE}?id=${OFFENSE_RESOURCE}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; result?: { last_modified?: string } };
    return json.result?.last_modified ?? null;
  } catch {
    return null;
  }
}

async function dateExtent(): Promise<{ min: string; max: string; n: number }> {
  return cached("extent", async () => {
    const rows = await ckanSql(
      `SELECT MIN("Report_Date") AS min_d, MAX("Report_Date") AS max_d, COUNT(*) AS n FROM ${tableRef()}`,
    );
    const row = rows[0] ?? {};
    return { min: str(row.min_d), max: str(row.max_d) || "2026-08-31", n: num(row.n) };
  });
}

function tableRef(): string {
  return `"${OFFENSE_RESOURCE}"`;
}
function cfsRef(): string {
  return `"${CFS_RESOURCE}"`;
}

function foldZips(rows: Array<Record<string, unknown>>): ZipStat[] {
  const map = new Map<string, ZipStat>();
  for (const row of rows) {
    const zip = padZip(row.zip);
    if (!/^\d{5}$/.test(zip)) continue;
    const rec = map.get(zip) ?? { zip, n: 0, prev: 0, cfs: 0, person: 0, property: 0, society: 0 };
    const n = num(row.n);
    rec.n += n;
    const against = str(row.against).toUpperCase();
    if (against === "PERSON") rec.person += n;
    else if (against === "PROPERTY") rec.property += n;
    else if (against === "SOCIETY") rec.society += n;
    map.set(zip, rec);
  }
  return [...map.values()].sort((a, b) => b.n - a.n);
}

function named(rows: Array<Record<string, unknown>>, nameKey: string): NamedCount[] {
  return rows
    .map((row) => ({ name: str(row[nameKey]), n: num(row.n) }))
    .filter((r) => r.name && r.name !== "None")
    .sort((a, b) => b.n - a.n);
}

function foldHours(rows: Array<Record<string, unknown>>): HourPoint[] {
  const by = new Map<number, number>();
  for (const row of rows) {
    const hour = Number(str(row.hr));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    by.set(hour, (by.get(hour) ?? 0) + num(row.n));
  }
  return Array.from({ length: 24 }, (_, hour) => ({ hour, n: by.get(hour) ?? 0 }));
}

function foldDow(rows: Array<Record<string, unknown>>): DowPoint[] {
  const by = new Map<string, number>();
  for (const row of rows) {
    const raw = str(row.d).slice(0, 3);
    const key = DOW_ORDER.find((d) => d.toLowerCase() === raw.toLowerCase());
    if (!key) continue;
    by.set(key, (by.get(key) ?? 0) + num(row.n));
  }
  return DOW_ORDER.map((day) => ({ day, n: by.get(day) ?? 0 }));
}

async function loadSnapshot(query: CrimeQuery): Promise<CrimeSnapshot> {
  const q = parseQuery(query);
  const extent = await dateExtent();
  const win = windowFor(extent.max, q.range);
  const where = whereClause(win.from, win.to, q.against, q.group);
  const prevWhere = whereClause(win.prevFrom, win.prevTo, q.against, q.group);
  const table = tableRef();
  const [
    zipRows,
    groupRows,
    againstRows,
    areaRows,
    dailyRows,
    codeRows,
    prevRows,
    prevZipRows,
    lastModified,
  ] = await Promise.all([
    ckanSql(
      `SELECT "Zip_Code" AS zip, "NIBRS_Crime_Against" AS against, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "Zip_Code", "NIBRS_Crime_Against"`,
    ),
    ckanSql(
      `SELECT "NIBRS_Group" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Group" ORDER BY n DESC`,
    ),
    ckanSql(
      `SELECT "NIBRS_Crime_Against" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Crime_Against"`,
    ),
    ckanSql(
      `SELECT "Service_Area" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "Service_Area" ORDER BY n DESC`,
    ),
    ckanSql(`SELECT "Report_Date" AS d, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "Report_Date" ORDER BY d`),
    ckanSql(
      `SELECT "NIBRS_Code_Name" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Code_Name" ORDER BY n DESC LIMIT 12`,
    ),
    ckanSql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${prevWhere}`),
    ckanSql(`SELECT "Zip_Code" AS zip, COUNT(*) AS n FROM ${table} WHERE ${prevWhere} GROUP BY "Zip_Code"`),
    resourceModified(),
  ]);

  const zips = foldZips(zipRows);
  const prevMap = new Map<string, number>();
  for (const row of prevZipRows) {
    const zip = padZip(row.zip);
    if (/^\d{5}$/.test(zip)) prevMap.set(zip, num(row.n));
  }
  for (const z of zips) z.prev = prevMap.get(z.zip) ?? 0;

  const total = zips.reduce((s, z) => s + z.n, 0);
  const daily: DailyPoint[] = dailyRows.map((row) => ({ date: str(row.d), n: num(row.n) }));

  return {
    asOf: extent.max,
    from: win.from,
    to: win.to,
    prevFrom: win.prevFrom,
    prevTo: win.prevTo,
    lastModified,
    total,
    previousTotal: num(prevRows[0]?.n),
    cfsTotal: 0,
    zips,
    groups: named(groupRows, "name"),
    against: named(againstRows, "name"),
    areas: named(areaRows, "name"),
    daily,
    topCodes: named(codeRows, "name"),
    hours: [],
    weekdays: [],
  };
}

export function isCrimeSnapshot(v: unknown): v is CrimeSnapshot {
  if (!v || typeof v !== "object") return false;
  const o = v as CrimeSnapshot;
  return typeof o.total === "number" && Array.isArray(o.zips);
}

export const getCrimeSnapshot = createServerFn({ method: "POST" })
  .validator((input: CrimeQuery) => parseQuery(input))
  .handler(async ({ data }): Promise<CrimeSnapshot> => {
    const key = `snap:${data.range}:${data.against}:${data.group}`;
    try {
      return await cached(key, () => loadSnapshot(data), isCrimeSnapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Open Data SA did not answer.";
      throw new Error(`Could not load SAPD reports. ${message}`);
    }
  });

export const getDemandStats = createServerFn({ method: "POST" })
  .validator((input: { range: RangeId }) => ({ range: isRange(input.range) ? input.range : "ytd" }))
  .handler(async ({ data }): Promise<DemandStats> => {
    const key = `demand:${data.range}`;
    try {
      return await cached(key, async () => {
      const extent = await dateExtent();
      const win = windowFor(extent.max, data.range);
      const demand = cfsWhere(win.from, win.to);
      const cfs = cfsRef();
      const [cfsZipRows, hourRows, dowRows] = await Promise.all([
        ckanSql(`SELECT "Postal_Code" AS zip, COUNT(*) AS n FROM ${cfs} WHERE ${demand} GROUP BY "Postal_Code"`).catch(
          () => [] as Array<Record<string, unknown>>,
        ),
        ckanSql(
          `SELECT substring("Response_Date" from 12 for 2) AS hr, COUNT(*) AS n FROM ${cfs} WHERE ${demand} GROUP BY 1`,
        ).catch(() => [] as Array<Record<string, unknown>>),
        ckanSql(`SELECT "Weekday" AS d, COUNT(*) AS n FROM ${cfs} WHERE ${demand} GROUP BY "Weekday"`).catch(
          () => [] as Array<Record<string, unknown>>,
        ),
      ]);
      const byZip: { zip: string; n: number }[] = [];
      let cfsTotal = 0;
      for (const row of cfsZipRows) {
        const zip = padZip(row.zip);
        if (!/^\d{5}$/.test(zip)) continue;
        const n = num(row.n);
        cfsTotal += n;
        byZip.push({ zip, n });
      }
      return { cfsTotal, byZip, hours: foldHours(hourRows), weekdays: foldDow(dowRows) };
    });
    } catch {
      return { cfsTotal: 0, byZip: [], hours: foldHours([]), weekdays: foldDow([]) };
    }
  });

export const getZipDetail = createServerFn({ method: "POST" })
  .validator((input: CrimeQuery & { zip: string }) => {
    const q = parseQuery(input);
    const zip = String(input.zip ?? "").replace(/\D/g, "").slice(0, 5);
    if (!/^\d{5}$/.test(zip)) throw new Error("Choose a five-digit ZIP code.");
    return { ...q, zip };
  })
  .handler(async ({ data }): Promise<ZipDetail> => {
    const key = `zip:${data.zip}:${data.range}:${data.against}:${data.group}`;
    return cached(key, async () => {
      const extent = await dateExtent();
      const win = windowFor(extent.max, data.range);
      const where = `${whereClause(win.from, win.to, data.against, data.group)} AND "Zip_Code" = ${sqlStr(data.zip)}`;
      const demand = `${cfsWhere(win.from, win.to)} AND "Postal_Code" = ${sqlStr(data.zip)}`;
      const table = tableRef();
      const cfs = cfsRef();
      const [groups, codes, areas, cfsRows, hourRows, dowRows] = await Promise.all([
        ckanSql(
          `SELECT "NIBRS_Group" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Group" ORDER BY n DESC`,
        ),
        ckanSql(
          `SELECT "NIBRS_Code_Name" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Code_Name" ORDER BY n DESC LIMIT 8`,
        ),
        ckanSql(
          `SELECT "Service_Area" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "Service_Area" ORDER BY n DESC`,
        ),
        ckanSql(`SELECT COUNT(*) AS n FROM ${cfs} WHERE ${demand}`).catch(() => [{ n: 0 }]),
        ckanSql(
          `SELECT substring("Response_Date" from 12 for 2) AS hr, COUNT(*) AS n FROM ${cfs} WHERE ${demand} GROUP BY 1`,
        ).catch(() => [] as Array<Record<string, unknown>>),
        ckanSql(`SELECT "Weekday" AS d, COUNT(*) AS n FROM ${cfs} WHERE ${demand} GROUP BY "Weekday"`).catch(
          () => [] as Array<Record<string, unknown>>,
        ),
      ]);
      return {
        zip: data.zip,
        groups: named(groups, "name"),
        codes: named(codes, "name"),
        areas: named(areas, "name"),
        cfs: num(cfsRows[0]?.n),
        hours: foldHours(hourRows),
        weekdays: foldDow(dowRows),
      };
    });
  });

function searchNeedle(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[%_\\]/g, " ")
    .replace(/[^a-zA-Z0-9 ./-]/g, "")
    .trim()
    .slice(0, 80);
}

function parseZipOpt(raw: unknown): string | undefined {
  const zip = String(raw ?? "").replace(/\D/g, "").slice(0, 5);
  return /^\d{5}$/.test(zip) ? zip : undefined;
}

export const getOffenseReports = createServerFn({ method: "POST" })
  .validator((input: CrimeQuery & { zip?: string; name?: string }) => {
    const q = parseQuery(input);
    return { ...q, zip: parseZipOpt(input.zip), name: searchNeedle(input.name) };
  })
  .handler(async ({ data }): Promise<OffenseList> => {
    const key = `rows:${data.range}:${data.against}:${data.group}:${data.zip ?? ""}:${data.name.toLowerCase()}`;
    return cached(key, async () => {
      const extent = await dateExtent();
      const win = windowFor(extent.max, data.range);
      const parts = [whereClause(win.from, win.to, data.against, data.group)];
      if (data.zip) parts.push(`"Zip_Code" = ${sqlStr(data.zip)}`);
      if (data.name.length >= 2) {
        const exact = sqlStr(data.name);
        const like = sqlStr(`%${data.name}%`);
        parts.push(
          `("NIBRS_Code_Name" = ${exact} OR "NIBRS_Code_Name" ILIKE ${like} OR "NIBRS_Group" ILIKE ${like} OR "Service_Area" ILIKE ${like} OR "Report_ID" ILIKE ${like})`,
        );
      }
      const where = parts.join(" AND ");
      const table = tableRef();
      const [rows, nameRows] = await Promise.all([
        ckanSql(
          `SELECT "Report_ID" AS id, "Report_Date" AS report_date, "DateTime" AS dt, "NIBRS_Code_Name" AS code, "NIBRS_Crime_Against" AS against, "NIBRS_Group" AS grp, "Service_Area" AS area, "Zip_Code" AS zip FROM ${table} WHERE ${where} ORDER BY "Report_Date" DESC, "Report_ID" DESC LIMIT 80`,
        ),
        data.name.length >= 2
          ? ckanSql(
              `SELECT "NIBRS_Code_Name" AS name, COUNT(*) AS n FROM ${table} WHERE ${where} GROUP BY "NIBRS_Code_Name" ORDER BY n DESC LIMIT 8`,
            )
          : Promise.resolve([]),
      ]);
      const reports = rows.map((row) => ({
        id: str(row.id),
        reportDate: str(row.report_date).slice(0, 10),
        dateTime: str(row.dt),
        codeName: str(row.code),
        against: str(row.against),
        group: str(row.grp),
        area: str(row.area),
        zip: padZip(row.zip),
      }));
      return {
        reports,
        names: named(nameRows, "name"),
        matched: reports.length,
      };
    }).catch(() => ({ reports: [], names: [], matched: 0 }));
  });
