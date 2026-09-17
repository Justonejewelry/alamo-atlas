import { Bell, Bookmark, Building2, Camera, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callFingerprint } from "@/lib/crime/follow";
import { useT } from "@/lib/crime/i18n";
import type { HomeZip } from "@/lib/crime/geo";
import type { DailyFeed } from "@/lib/crime/daily";
import type { CallAgency, CallSeverity, LiveCall, LiveFeed, WeatherAlert } from "@/lib/crime/live";
import { registerAtlasAlerts, requestQuietAlerts } from "@/lib/crime/notify";
import { FOLLOW_CAP, watchKey, usePrefs, type FollowItem, type WatchItem } from "@/lib/crime/prefs";
import { cn } from "@/lib/utils";

function timeAgo(ms: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export type LiveSevFilter = "all" | CallSeverity;
export type AgencyFilter = "all" | CallAgency;

export function AlertsFeed({
  feed,
  loading,
  error,
  onRetry,
  home,
  nearby,
  citywide,
  outside,
  onSelectCall,
  selectedCallId,
  nameQuery,
  watch,
  onAddWatch,
  onRemoveWatch,
  history,
  digest,
  stale,
  showHistory,
  onAddPlace,
  onDismissDigest,
  selectedCall,
  onClearCall,
  showYesterday,
  yesterday,
  yesterdayLoading,
  yesterdayError,
  onRetryYesterday,
}: {
  feed: LiveFeed | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  home: HomeZip | null;
  nearby: Array<LiveCall & { miles: number }>;
  citywide: LiveCall[];
  outside: boolean;
  onSelectCall: (call: LiveCall) => void;
  selectedCallId: string | null;
  selectedCall: LiveCall | null;
  onClearCall: () => void;
  nameQuery?: string;
  watch: WatchItem[];
  onAddWatch: (zip: string) => void;
  onRemoveWatch: (zip: string) => void;
  history: LiveCall[];
  digest: LiveCall[];
  stale: boolean;
  showHistory: boolean;
  onAddPlace: (call: LiveCall) => void;
  onDismissDigest: () => void;
  showYesterday?: boolean;
  yesterday?: DailyFeed | null;
  yesterdayLoading?: boolean;
  yesterdayError?: string | null;
  onRetryYesterday?: () => void;
}) {
  const t = useT();
  const [yesterdayShown, setYesterdayShown] = useState(200);
  const q = (nameQuery ?? "").trim().toLowerCase();
  const match = (c: LiveCall) =>
    !q ||
    c.problem.toLowerCase().includes(q) ||
    c.address.toLowerCase().includes(q) ||
    c.street.toLowerCase().includes(q) ||
    c.division.toLowerCase().includes(q);
  const nearFiltered = nearby.filter(match);
  const cityFiltered = citywide.filter(match);
  const histFiltered = history.filter(match);
  const highNearby = nearFiltered.filter((c) => c.severity === "high").length;
  const allCalls = showYesterday ? (yesterday?.calls ?? []) : (feed?.calls ?? []);
  const nPolice = showYesterday
    ? (yesterday?.police ?? allCalls.filter((c) => (c.agency ?? "police") === "police").length)
    : allCalls.filter((c) => (c.agency ?? "police") === "police").length;
  const nFire = showYesterday
    ? (yesterday?.fire ?? allCalls.filter((c) => c.agency === "fire").length)
    : allCalls.filter((c) => c.agency === "fire").length;
  const nEms = showYesterday
    ? (yesterday?.ems ?? allCalls.filter((c) => c.agency === "ems").length)
    : allCalls.filter((c) => c.agency === "ems").length;
  const watchingKeys = new Set(watch.map((w) => watchKey(w)));
  const homeWatched = home ? watchingKeys.has(watchKey({ zip: home.zip, name: home.name })) : false;
  const follow = usePrefs((s) => s.follow) ?? [];
  const addFollow = usePrefs((s) => s.addFollow);
  const removeFollow = usePrefs((s) => s.removeFollow);
  const followingIds = new Set(follow.map((f) => f.id));

  async function toggleFollow(call: LiveCall) {
    if (followingIds.has(call.id)) {
      removeFollow(call.id);
      toast(t("follow.toastOff"));
      return;
    }
    if (follow.length >= FOLLOW_CAP) {
      toast(t("follow.cap"));
      return;
    }
    const item: FollowItem = {
      kind: "call",
      id: call.id,
      title: call.problem,
      subtitle: [call.address, call.zip].filter(Boolean).join(" · "),
      fingerprint: callFingerprint(call),
      status: "open",
      since: Date.now(),
    };
    addFollow(item);
    toast(t("follow.toastOn"), { description: item.subtitle });
    const ok = await requestQuietAlerts();
    if (ok) void registerAtlasAlerts(watch, [...follow.filter((f) => f.id !== item.id), item]);
  }

  function togglePlace(c: LiveCall) {
    const item = { zip: c.zip, name: c.address, address: c.address, street: c.street };
    const key = watchKey(item);
    if (watchingKeys.has(key)) onRemoveWatch(key);
    else onAddPlace(c);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        {stale ? (
          <p className="mb-2 rounded-sm border border-heat-3/40 bg-heat-3/10 px-3 py-2 text-sm text-fg">
            {t("live.stale")}
          </p>
        ) : null}
        <p className="text-xs text-subtle">
          {feed
            ? t("agency.counts", { police: nPolice, fire: nFire, ems: nEms })
            : t("live.officers")}
          {feed?.sourceUpdated ? ` · ${t("live.boardAt", { when: feed.sourceUpdated })}` : ""}
        </p>
        {outside ? (
          <p className="mt-2 rounded-sm bg-surface-2 px-3 py-2 text-sm text-muted">{t("live.outside")}</p>
        ) : home ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-3 py-1">
            <p className="min-w-0 truncate text-sm text-fg">
              {t("live.watching", { zip: home.zip, name: home.name })}
              {home.miles < 50
                ? ` · ${home.miles < 0.2 ? t("live.here") : t("live.fromPin", { mi: home.miles.toFixed(1) })}`
                : ""}
            </p>
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center text-accent"
              onClick={() => (homeWatched ? onRemoveWatch(home.zip) : onAddWatch(home.zip))}
              aria-label={homeWatched ? t("watch.remove", { zip: home.zip }) : t("watch.add", { zip: home.zip })}
            >
              <Star className={cn("size-4", homeWatched && "fill-accent")} />
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("live.shareLocation")}</p>
        )}
        {highNearby > 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent">
            <Bell className="size-3.5" />
            {t("live.priorityNear", {
              n: highNearby,
              calls: highNearby === 1 ? t("live.call") : t("live.calls"),
            })}
          </p>
        ) : null}
      </div>

      {selectedCall ? (
        <div className="min-h-0 max-h-1/2 overflow-y-auto border-b border-border px-4 py-3">
          <CallCard
            call={selectedCall}
            onClose={onClearCall}
            following={followingIds.has(selectedCall.id)}
            onToggleFollow={toggleFollow}
          />
        </div>
      ) : null}

      <div className="panel-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3">
        {error && !showYesterday ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        {showYesterday ? (
          <section>
            <h3 className="atlas-kicker">{t("daily.title")}</h3>
            <p className="mt-1 text-sm text-fg">{yesterday?.label ?? ""}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{t("daily.hint")}</p>
            {yesterday?.error ? <p className="mt-2 text-sm text-muted">{yesterday.error}</p> : null}
            {yesterdayError ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-muted">{yesterdayError}</p>
                {onRetryYesterday ? (
                  <Button variant="outline" size="sm" onClick={onRetryYesterday}>
                    {t("retry")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {yesterdayLoading && !(yesterday?.calls.length) ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (yesterday?.calls ?? []).filter(match).length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("daily.empty")}</p>
            ) : (
              <>
                <p className="mt-2 text-xs text-subtle">
                  {t("daily.n", { n: (yesterday?.calls ?? []).filter(match).length })}
                  {yesterday
                    ? ` · ${t("agency.counts", { police: yesterday.police, fire: yesterday.fire, ems: yesterday.ems })}`
                    : ""}
                </p>
                <CallList
                  calls={(yesterday?.calls ?? []).filter(match).slice(0, yesterdayShown)}
                  onSelectCall={onSelectCall}
                  selectedCallId={selectedCallId}
                  watchingKeys={watchingKeys}
                  onTogglePlace={togglePlace}
                  followingIds={followingIds}
                />
                {(yesterday?.calls ?? []).filter(match).length > yesterdayShown ? (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => setYesterdayShown((n) => n + 200)}
                  >
                    {t("daily.more")}
                  </Button>
                ) : (
                  <p className="mt-3 text-xs text-subtle">
                    {t("daily.all", { n: (yesterday?.calls ?? []).filter(match).length })}
                  </p>
                )}
              </>
            )}
          </section>
        ) : (
          <>
        {digest.length > 0 ? (
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="atlas-kicker">{t("digest.title")}</h3>
              <Button variant="chip" size="chip" onClick={onDismissDigest}>
                {t("digest.dismiss")}
              </Button>
            </div>
            <p className="mt-1 text-xs text-subtle">{t("digest.n", { n: digest.length })}</p>
            <CallList
              calls={digest.slice(0, 12)}
              onSelectCall={onSelectCall}
              selectedCallId={selectedCallId}
              watchingKeys={watchingKeys}
              onTogglePlace={togglePlace}
              followingIds={followingIds}
            />
          </section>
        ) : null}

        {feed?.weather && feed.weather.length > 0 ? (
          <section>
            <h3 className="atlas-kicker">{t("live.nws")}</h3>
            <ul className="mt-2 space-y-2">
              {feed.weather.map((w: WeatherAlert) => (
                <li key={w.id} className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
                  <p className="font-medium text-fg">{w.event}</p>
                  <p className="text-xs text-muted">{w.headline}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showHistory ? (
          <section>
            <h3 className="atlas-kicker">{t("live.history")}</h3>
            <p className="mt-1 text-xs text-subtle">{t("live.historyHint")}</p>
            {loading && histFiltered.length === 0 ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : histFiltered.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("live.historyEmpty")}</p>
            ) : (
              <CallList
                calls={histFiltered.slice(0, 60)}
                onSelectCall={onSelectCall}
                selectedCallId={selectedCallId}
                watchingKeys={watchingKeys}
                onTogglePlace={togglePlace}
                followingIds={followingIds}
              />
            )}
          </section>
        ) : (
          <>
            {home && !outside ? (
              <section>
                <h3 className="atlas-kicker">{t("live.nearYou")}</h3>
                {loading && nearFiltered.length === 0 ? (
                  <div className="mt-2 space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : nearFiltered.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("live.noneNear")}</p>
                ) : (
                  <CallList
                    calls={nearFiltered}
                    onSelectCall={onSelectCall}
                    selectedCallId={selectedCallId}
                    showMiles
                    watchingKeys={watchingKeys}
                    onTogglePlace={togglePlace}
                    followingIds={followingIds}
                  />
                )}
              </section>
            ) : null}

            <section>
              <h3 className="atlas-kicker">{t("live.citywide")}</h3>
              {loading && cityFiltered.length === 0 ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : cityFiltered.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("live.noneCity")}</p>
              ) : (
                <CallList
                  calls={cityFiltered.slice(0, 40)}
                  onSelectCall={onSelectCall}
                  selectedCallId={selectedCallId}
                  watchingKeys={watchingKeys}
                  onTogglePlace={togglePlace}
                  followingIds={followingIds}
                />
              )}
            </section>
          </>
        )}
          </>
        )}

      </div>
    </div>
  );
}

function CameraStill({ camera }: { camera: NonNullable<LiveCall["camera"]> }) {
  const t = useT();
  const make = (n: number) => `/api/camera?id=${encodeURIComponent(camera.id)}&t=${n}`;
  const [src, setSrc] = useState(() => make(0));
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setSrc(make(0));
    setReady(false);
    setErr(false);
    setTick(0);
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [camera.id]);
  const preload = tick > 0 ? make(tick) : null;
  return (
    <figure data-atlas="transguide" className="mt-3">
      <p className="atlas-kicker mb-1.5 flex items-center gap-1.5">
        <Camera className="size-3.5" />
        {t("camera.kicker")}
        {ready ? <span className="live-dot ml-1" aria-hidden="true" /> : null}
      </p>
      <div className="relative overflow-hidden rounded-md bg-surface">
        {err && !ready ? (
          <button
            type="button"
            className="flex min-h-36 w-full items-center justify-center px-3 text-sm text-accent"
            onClick={() => {
              setErr(false);
              setTick((n) => n + 1);
            }}
          >
            {t("camera.retry")}
          </button>
        ) : (
          <img
            src={src}
            alt=""
            className={cn("max-h-44 w-full object-cover", !ready && "min-h-36 opacity-0")}
            onLoad={() => {
              setReady(true);
              setErr(false);
            }}
            onError={() => {
              if (!ready) setErr(true);
            }}
          />
        )}
        {!ready && !err ? (
          <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-subtle">
            {t("camera.loading")}
          </p>
        ) : null}
        {preload ? (
          <img
            src={preload}
            alt=""
            className="hidden"
            onLoad={() => {
              setSrc(preload);
              setReady(true);
              setErr(false);
            }}
          />
        ) : null}
      </div>
      <figcaption className="mt-1.5 text-xs leading-relaxed text-subtle">
        {t("camera.caption", { name: camera.name, mi: camera.miles.toFixed(1) })}
      </figcaption>
      <a
        href="https://its.txdot.gov/its/District/SAT/cameras"
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex min-h-11 items-center text-xs text-accent"
      >
        {t("camera.open")}
      </a>
    </figure>
  );
}

function CallCard({
  call,
  onClose,
  following,
  onToggleFollow,
}: {
  call: LiveCall;
  onClose: () => void;
  following?: boolean;
  onToggleFollow?: (call: LiveCall) => void;
}) {
  const t = useT();
  const quality = call.geo ?? (call.lat != null ? "block" : call.zip ? "zip" : "none");
  const geo =
    quality === "zip" ? t("call.geoZip") : quality === "none" ? t("call.geoNone") : t("call.geoBlock");
  const extras: { label: string; value: string }[] = [];
  extras.push({ label: t("call.id"), value: call.id });
  extras.push({ label: t("call.calledIn"), value: call.asCalledIn ?? call.problem });
  if (call.when) extras.push({ label: t("call.boardTime"), value: call.when });
  if (call.units) extras.push({ label: t("call.unitsLabel"), value: t("call.unitsN", { n: call.units }) });
  if (call.tac) extras.push({ label: t("call.tac"), value: call.tac });
  if (call.crossStreet) extras.push({ label: t("call.cross"), value: call.crossStreet });
  if (call.locationType) extras.push({ label: t("call.placeType"), value: call.locationType });
  return (
    <section className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full",
            (call.agency ?? "police") === "police" && call.severity === "high" && "bg-accent",
            (call.agency ?? "police") === "police" && call.severity !== "high" && "bg-heat-3",
            call.agency === "fire" && "bg-fire",
            call.agency === "ems" && "bg-ems",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-medium leading-snug text-fg">{call.problem}</h3>
          <p className="mt-1 text-sm text-muted">
            {t(`agency.${call.agency ?? "police"}`)}
            {` · ${timeAgo(call.whenMs)}`}
            {call.division ? ` · ${call.division}` : ""}
          </p>
          <p className="mt-1 text-sm text-fg">
            {call.address}
            {call.zip ? ` · ${call.zip}` : ""}
            {` · ${t("call.block")}`}
          </p>
          {onToggleFollow ? (
            <Button
              variant="chip"
              size="chip"
              className="mt-3"
              data-atlas="follow"
              data-active={following}
              onClick={() => onToggleFollow(call)}
            >
              <Bookmark className={cn("size-4", following && "fill-current")} />
              {following ? t("follow.following") : t("follow.label")}
            </Button>
          ) : null}
          {call.camera ? <CameraStill camera={call.camera} /> : null}
          {call.txdot ? (
            <p className="mt-3 text-sm leading-snug text-fg">{t("camera.txdot", { note: call.txdot.summary })}</p>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {extras.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="atlas-kicker">{row.label}</dt>
                <dd className="mt-0.5 break-words text-sm text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            {t("call.calledInHint")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            {t("call.cfs")} {geo} {t("call.privacy")}
          </p>
        </div>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center text-muted"
          onClick={onClose}
          aria-label={t("call.close")}
        >
          ×
        </button>
      </div>
    </section>
  );
}

function CallList({
  calls,
  onSelectCall,
  selectedCallId,
  showMiles,
  watchingKeys,
  onTogglePlace,
  followingIds,
}: {
  calls: Array<LiveCall & { miles?: number }>;
  onSelectCall: (call: LiveCall) => void;
  selectedCallId: string | null;
  showMiles?: boolean;
  watchingKeys?: Set<string>;
  onTogglePlace?: (call: LiveCall) => void;
  followingIds?: Set<string>;
}) {
  const t = useT();
  return (
    <ul className="mt-2 divide-y divide-border">
      {calls.map((c) => {
        const key = watchKey({ zip: c.zip, name: c.address, address: c.address, street: c.street });
        const watching = watchingKeys?.has(key) ?? false;
        const followed = followingIds?.has(c.id) ?? false;
        return (
          <li key={c.id} className={cn("flex items-stretch", selectedCallId === c.id && "bg-accent/10")}>
            <button
              type="button"
              onClick={() => onSelectCall(c)}
              aria-label={`${c.problem}. ${t(`agency.${c.agency ?? "police"}`)}. ${c.address}. ${timeAgo(c.whenMs)}${c.camera ? `. ${t("camera.kicker")}` : ""}`}
              aria-current={selectedCallId === c.id}
              className="flex min-h-12 min-w-0 flex-1 items-start gap-3 py-3 text-left"
            >
              <span
                className={cn(
                  "mt-1 size-2.5 shrink-0 rounded-full",
                  (c.agency ?? "police") === "police" && c.severity === "high" && "bg-accent",
                  (c.agency ?? "police") === "police" && c.severity !== "high" && "bg-heat-3",
                  c.agency === "fire" && "bg-fire",
                  c.agency === "ems" && "bg-ems",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-base text-fg">{c.problem}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {followed ? <Bookmark className="size-3 fill-accent text-accent" aria-hidden="true" /> : null}
                    <span className="text-xs tabular-nums text-subtle">{timeAgo(c.whenMs)}</span>
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {t(`agency.${c.agency ?? "police"}`)}
                  {c.units ? ` · ${c.units}` : ""}
                  {` · ${c.address}`}
                  {c.zip ? ` · ${c.zip}` : ""}
                  {c.division ? ` · ${c.division}` : ""}
                  {showMiles && c.miles != null ? ` · ${c.miles.toFixed(1)} mi` : ""}
                </span>
                {c.camera ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
                    <Camera className="size-3" />
                    {t("camera.kicker")}
                  </span>
                ) : null}
              </span>
            </button>
            {onTogglePlace ? (
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
                onClick={() => onTogglePlace(c)}
                aria-label={watching ? t("watch.watchingPlace") : t("watch.addPlace")}
                aria-pressed={watching}
              >
                <Building2 className={cn("size-4", watching && "fill-accent text-accent")} />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
