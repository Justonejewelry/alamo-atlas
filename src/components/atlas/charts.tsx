import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DOW_EN, DOW_ES } from "@/lib/crime/constants";
import { formatCompact, formatDate, formatNumber, groupLabel } from "@/lib/crime/format";
import type { Locale } from "@/lib/crime/prefs";
import type { DailyPoint, DowPoint, HourPoint, NamedCount } from "@/lib/crime/types";

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs text-fg shadow-lg">
      <p className="text-muted">{label}</p>
      <p className="font-medium tabular-nums">{formatNumber(payload[0].value)}</p>
    </div>
  );
}

export function TrendChart({ daily }: { daily: DailyPoint[] }) {
  const data = daily.map((d) => ({
    ...d,
    label: formatDate(d.date).replace(/,\s+\d{4}$/, ""),
  }));
  if (data.length === 0) {
    return <p className="text-sm text-muted">—</p>;
  }
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="atlasFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide />
          <Tooltip content={<ChartTip />} />
          <Area
            type="monotone"
            dataKey="n"
            stroke="var(--color-accent)"
            fill="url(#atlasFill)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const AGAINST_FILL: Record<string, string> = {
  PERSON: "var(--color-person)",
  PROPERTY: "var(--color-property)",
  SOCIETY: "var(--color-society)",
};

export function GroupBars({ groups, locale = "en" }: { groups: NamedCount[]; locale?: Locale }) {
  const data = groups.slice(0, 8).map((g) => ({
    name: groupLabel(g.name, locale),
    n: g.n,
  }));
  if (data.length === 0) return null;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTip />} />
          <Bar dataKey="n" radius={[0, 3, 3, 0]} fill="var(--color-accent)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AgainstBars({ against }: { against: NamedCount[] }) {
  const total = against.reduce((s, a) => s + a.n, 0) || 1;
  const order = ["PERSON", "PROPERTY", "SOCIETY"];
  const rows = order
    .map((name) => against.find((a) => a.name.toUpperCase() === name))
    .filter(Boolean) as NamedCount[];
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className="h-full"
            style={{
              width: `${(row.n / total) * 100}%`,
              background: AGAINST_FILL[row.name.toUpperCase()] ?? "var(--color-muted)",
            }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {rows.map((row) => (
          <li key={row.name} className="min-w-0">
            <p className="atlas-kicker flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ background: AGAINST_FILL[row.name.toUpperCase()] }}
              />
              {row.name.toLowerCase()}
            </p>
            <p className="tabular-nums text-sm text-fg">{formatCompact(row.n)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HourChart({ hours }: { hours: HourPoint[] }) {
  const data = hours.map((h) => ({
    label: String(h.hour).padStart(2, "0"),
    n: h.n,
  }));
  if (data.every((d) => d.n === 0)) return null;
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            interval={5}
            tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<ChartTip />} />
          <Bar dataKey="n" radius={[2, 2, 0, 0]} fill="var(--color-accent)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DowChart({ weekdays, locale = "en" }: { weekdays: DowPoint[]; locale?: Locale }) {
  const labels = locale === "es" ? DOW_ES : DOW_EN;
  const data = weekdays.map((d, i) => ({
    label: labels[i] ?? d.day,
    n: d.n,
  }));
  if (data.every((d) => d.n === 0)) return null;
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: "var(--color-subtle)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip content={<ChartTip />} />
          <Bar dataKey="n" radius={[2, 2, 0, 0]} fill="var(--color-accent)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DemandCompare({
  cfs,
  reports,
  cfsLabel,
  reportsLabel,
}: {
  cfs: number;
  reports: number;
  cfsLabel: string;
  reportsLabel: string;
}) {
  const max = Math.max(cfs, reports, 1);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted">{cfsLabel}</span>
          <span className="tabular-nums text-fg">{formatNumber(cfs)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(cfs / max) * 100}%` }} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted">{reportsLabel}</span>
          <span className="tabular-nums text-fg">{formatNumber(reports)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-heat-3" style={{ width: `${(reports / max) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
