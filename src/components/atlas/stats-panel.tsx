import { ArrowDownRight, ArrowUpRight, MapPin, Star, X } from "lucide-react";
import { AgainstBars, DemandCompare, DowChart, GroupBars, HourChart, TrendChart } from "@/components/atlas/charts";
import { ReportsList } from "@/components/atlas/reports-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, formatPct, formatSpike, pctChange, spikeRatio } from "@/lib/crime/format";
import { useT } from "@/lib/crime/i18n";
import type { CrimeSnapshot, OffenseList, ZipDetail, ZipStat } from "@/lib/crime/types";
import { cn } from "@/lib/utils";
import type { MapSelection } from "./crime-map";

type ZipMeta = { name: string; sqmi: number; households: number | null; income: number | null };

export function StatsPanel({
  snapshot,
  loading,
  error,
  onRetry,
  selected,
  selectedMeta,
  selectedStat,
  zipDetail,
  zipDetailLoading,
  reports,
  reportsLoading,
  nameFilter,
  onClearName,
  onSelectZip,
  onClear,
  onPickName,
  watching,
  onToggleWatch,
}: {
  snapshot: CrimeSnapshot | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selected: MapSelection;
  selectedMeta: ZipMeta | null;
  selectedStat: ZipStat | null;
  zipDetail: ZipDetail | undefined;
  zipDetailLoading: boolean;
  reports: OffenseList | undefined;
  reportsLoading: boolean;
  nameFilter: string;
  onClearName: () => void;
  onSelectZip: (zip: string) => void;
  onClear: () => void;
  onPickName: (name: string) => void;
  watching: boolean;
  onToggleWatch: () => void;
}) {
  const t = useT();
  const delta = snapshot ? pctChange(snapshot.total, snapshot.previousTotal) : null;
  const up = (delta ?? 0) > 0.05;
  const down = (delta ?? 0) < -0.05;
  const zip = selected?.kind === "zip" ? selected.id : null;
  const localSpike = selectedStat ? spikeRatio(selectedStat.n, selectedStat.prev) : null;
  const hours =
    zip && zipDetail && zipDetail.hours.some((h) => h.n > 0) ? zipDetail.hours : snapshot?.hours;
  const weekdays =
    zip && zipDetail && zipDetail.weekdays.some((d) => d.n > 0) ? zipDetail.weekdays : snapshot?.weekdays;
  const cfs = zip && zipDetail ? zipDetail.cfs : (snapshot?.cfsTotal ?? 0);
  const offenseN = zip && selectedStat ? selectedStat.n : (snapshot?.total ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        {loading && !snapshot ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-36" />
          </div>
        ) : error && !snapshot ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : snapshot ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="atlas-kicker">{t("stats.offenses")}</p>
                <p className="mt-1 font-display text-4xl leading-none tracking-tight text-fg tabular-nums">
                  {formatNumber(snapshot.total)}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {delta != null ? (
                <span
                  className={`inline-flex items-center gap-1 tabular-nums ${up ? "text-up" : down ? "text-down" : "text-muted"}`}
                >
                  {up ? <ArrowUpRight className="size-3.5" /> : down ? <ArrowDownRight className="size-3.5" /> : null}
                  {formatPct(delta)} {t("stats.vsPrior")}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-subtle">
              {formatDate(snapshot.from)} – {formatDate(snapshot.to)}
            </p>
          </>
        ) : null}
      </div>

      <div className="panel-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-3">
        {selected ? (
          <section className="rounded-lg bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="atlas-kicker flex items-center gap-1.5">
                  <MapPin className="size-3" />
                  {selected.kind === "zip" ? t("stats.zip") : t("stats.area")}
                </p>
                <h2 className="mt-1 font-display text-2xl tracking-tight">{selected.id}</h2>
                {selected.kind === "zip" && selectedMeta ? (
                  <p className="text-sm text-muted">{selectedMeta.name}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                {selected.kind === "zip" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleWatch}
                    aria-label={watching ? t("watch.remove", { zip: selected.id }) : t("watch.add", { zip: selected.id })}
                  >
                    <Star className={cn("size-4", watching && "fill-accent text-accent")} />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" onClick={onClear} aria-label={t("stats.clear")}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            {selected.kind === "zip" && selectedStat ? (
              <>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="atlas-kicker">{t("stats.reports")}</dt>
                    <dd className="tabular-nums text-fg">{formatNumber(selectedStat.n)}</dd>
                  </div>
                  <div>
                    <dt className="atlas-kicker">{t("stats.perSqMi")}</dt>
                    <dd className="tabular-nums text-fg">
                      {selectedMeta && selectedMeta.sqmi > 0
                        ? formatNumber(selectedStat.n / selectedMeta.sqmi)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="atlas-kicker">{t("stats.households")}</dt>
                    <dd className="tabular-nums text-fg">
                      {selectedMeta?.households ? formatNumber(selectedMeta.households) : "—"}
                    </dd>
                  </div>
                </dl>
                {localSpike != null ? (
                  <p
                    className={cn(
                      "mt-3 text-sm tabular-nums",
                      localSpike >= 1.4 ? "text-accent" : localSpike < 0.7 ? "text-down" : "text-muted",
                    )}
                  >
                    {t("stats.spike", { x: formatSpike(localSpike) })}
                    {localSpike >= 1.4
                      ? ` · ${t("stats.spikeHot")}`
                      : localSpike < 0.7
                        ? ` · ${t("stats.spikeQuiet")}`
                        : ` · ${t("stats.spikeUsual")}`}
                  </p>
                ) : null}
              </>
            ) : null}
            {zipDetailLoading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : zipDetail ? (
              <ul className="mt-4 space-y-1.5">
                {zipDetail.codes.slice(0, 6).map((c) => (
                  <li key={c.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-muted hover:text-fg"
                      onClick={() => onPickName(c.name)}
                    >
                      {c.name}
                    </button>
                    <span className="tabular-nums text-fg">{formatNumber(c.n)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {snapshot ? (
          <section>
            <h3 className="atlas-kicker">{t("stats.demand")}</h3>
            <div className="mt-3">
              <DemandCompare
                cfs={cfs}
                reports={offenseN}
                cfsLabel={t("stats.cfs")}
                reportsLabel={t("stats.offensesShort")}
              />
            </div>
            <p className="mt-2 text-xs text-subtle">{t("stats.demandHint")}</p>
          </section>
        ) : null}

        {hours && hours.some((h) => h.n > 0) ? (
          <section>
            <h3 className="atlas-kicker">{t("stats.hours")}</h3>
            <div className="mt-2">
              <HourChart hours={hours} />
            </div>
            <p className="mt-1 text-xs text-subtle">{t("stats.hoursHint")}</p>
          </section>
        ) : null}

        {weekdays && weekdays.some((d) => d.n > 0) ? (
          <section>
            <h3 className="atlas-kicker">{t("stats.weekdays")}</h3>
            <div className="mt-2">
              <DowChart weekdays={weekdays} locale={t.locale} />
            </div>
          </section>
        ) : null}

        <ReportsList
          list={reports}
          loading={reportsLoading}
          nameFilter={nameFilter}
          zip={zip}
          onSelectZip={onSelectZip}
          onClearName={onClearName}
        />

        {snapshot ? (
          <>
            <section>
              <h3 className="atlas-kicker">{t("stats.against")}</h3>
              <div className="mt-3">
                <AgainstBars against={snapshot.against} />
              </div>
            </section>

            <section>
              <h3 className="atlas-kicker">{t("stats.daily")}</h3>
              <div className="mt-2">
                <TrendChart daily={snapshot.daily} />
              </div>
            </section>

            <section>
              <h3 className="atlas-kicker">{t("stats.groups")}</h3>
              <GroupBars groups={snapshot.groups} locale={t.locale} />
            </section>

            <section>
              <h3 className="atlas-kicker">{t("stats.areas")}</h3>
              <ol className="mt-3 space-y-2">
                {snapshot.areas.map((a, i) => {
                  const max = snapshot.areas[0]?.n || 1;
                  return (
                    <li key={a.name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted">
                          <span className="mr-2 tabular-nums text-subtle">{String(i + 1).padStart(2, "0")}</span>
                          {a.name}
                        </span>
                        <span className="tabular-nums text-fg">{formatNumber(a.n)}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent/70" style={{ width: `${(a.n / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section>
              <h3 className="atlas-kicker">{t("stats.most")}</h3>
              <ul className="mt-3 space-y-1.5">
                {snapshot.topCodes.map((c) => (
                  <li key={c.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-muted hover:text-fg"
                      onClick={() => onPickName(c.name)}
                    >
                      {c.name}
                    </button>
                    <span className="tabular-nums text-fg">{formatNumber(c.n)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="pb-4 text-xs leading-relaxed text-subtle">{t("stats.disclaimer")}</p>
          </>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
