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
  const parts = [`\"Report_Date\" >= ${sqlStr(from)}`, `\"Report_Date\" <= ${sqlStr(to)}`];
  if (against !== "ALL") parts.push(`\"NIBRS_Crime_Against\" = ${sqlStr(against)}`);
  if (group !== "ALL") parts.push(`\"NIBRS_Group\" = ${sqlStr(group)}`);
  return parts.join(" AND ");
}
