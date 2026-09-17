import { GROUP_SHORT, GROUP_SHORT_ES } from "./constants";
import type { Locale } from "./prefs";

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  if (!y || !m) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function groupLabel(name: string, locale: Locale = "en"): string {
  if (locale === "es") return GROUP_SHORT_ES[name] ?? GROUP_SHORT[name] ?? name;
  return GROUP_SHORT[name] ?? name;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function formatPct(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${body}%`;
}

export function spikeRatio(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 4 : null;
  return current / previous;
}

export function formatSpike(ratio: number): string {
  if (ratio >= 10) return ratio.toFixed(0);
  return ratio >= 2 ? ratio.toFixed(1) : ratio.toFixed(2);
}

export function quantileBreaks(values: number[], bins = 5): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 1, 2, 3, 4];
  const breaks: number[] = [];
  for (let i = 1; i < bins; i++) {
    const q = i / bins;
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    breaks.push(sorted[idx] ?? 0);
  }
  breaks.push(sorted[sorted.length - 1] ?? 0);
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]!) breaks[i] = breaks[i - 1]! + Number.EPSILON;
  }
  return breaks;
}

export function binIndex(value: number, breaks: number[]): number {
  if (value <= 0) return -1;
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]!) return i;
  }
  return breaks.length - 1;
}

export function parseCoord(v: string | number | null | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
