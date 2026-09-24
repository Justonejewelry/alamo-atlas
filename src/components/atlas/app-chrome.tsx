import { Drawer } from "vaul";
import {
  BarChart3,
  Bell,
  BellOff,
  Bookmark,
  BookOpen,
  Building2,
  FileDown,
  Layers,
  MapPin,
  Menu,
  MessageSquare,
  Radio,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Hint } from "@/components/atlas/hint";
import { Button } from "@/components/ui/button";
import {
  AGAINST,
  FEATURED_GROUPS,
  NIBRS_GROUPS,
  RANGES,
  type AgainstId,
  type RangeId,
} from "@/lib/crime/constants";
import { useT } from "@/lib/crime/i18n";
import type { Locale, FollowItem, WatchItem } from "@/lib/crime/prefs";
import { watchKey } from "@/lib/crime/prefs";
import type { Geography, Metric } from "@/lib/crime/types";
import { cn } from "@/lib/utils";
import type { AgencyFilter, LiveSevFilter } from "./alerts-feed";
import type { LiveWindow } from "@/lib/crime/live";

export type ChromeMenu = "filters" | "more" | "search" | null;

export type SearchHit =
  | { kind: "zip"; zip: string; name: string }
  | { kind: "group"; id: string; name: string }
  | { kind: "offense"; name: string; n: number }
  | { kind: "street"; street: string; zip: string; lat?: number; lng?: number }
  | {
      kind: "live";
      id: string;
      problem: string;
      zip: string;
      address: string;
      street: string;
      lat?: number;
      lng?: number;
    };

function RollSheet({
  open,
  onOpenChange,
  title,
  hint,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      noBodyStyles
      disablePreventScroll
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-bg/55" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[85dvh] flex-col rounded-t-xl border border-border bg-surface outline-none">
          <Drawer.Handle className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" />
          <div className="flex items-center gap-1 px-3 pt-2">
            <Drawer.Title className="flex-1 px-2 font-display text-2xl tracking-tight">{title}</Drawer.Title>
            {hint ? <Hint title={title} body={hint} /> : null}
          </div>
          <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-center gap-0.5 px-2">
        <h3 className="atlas-kicker">{title}</h3>
        <Hint title={title} body={hint} />
      </div>
      {children}
    </section>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1 px-1">{children}</div>;
}

export function AppTopBar({
  liveCount,
  liveLabel,
  searchOpen,
  onSearch,
}: {
  liveCount: number | undefined;
  liveLabel: string;
  searchOpen: boolean;
  onSearch: () => void;
}) {
  const t = useT();
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto mx-auto flex h-12 max-w-lg items-center gap-2 rounded-xl border border-border bg-bg/88 px-2 shadow-float backdrop-blur-md">
        <img
          src="/logo.jpg"
          alt=""
          width={32}
          height={32}
          className="atlas-topbar-logo size-8 shrink-0 rounded-full object-cover ring-1 ring-accent/40"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg leading-none tracking-tight text-[#f3efe6]">
            Alamo Atlas
          </h1>
        </div>
        <span className="atlas-live-pill shrink-0" title={liveLabel}>
          <span className="live-dot !size-1.5 !animate-none opacity-100" aria-hidden="true" />
          {t("tab.live")}
          {liveCount != null ? (
            <span className="tabular-nums opacity-90">{liveCount}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onSearch}
          aria-label={t("menu.search")}
          aria-pressed={searchOpen}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md text-fg",
            searchOpen && "text-accent",
          )}
        >
          {searchOpen ? <X className="size-5" /> : <Search className="size-5" />}
        </button>
      </div>
    </header>
  );
}

export function AppDock({
  tab,
  liveCount,
  menu,
  filtersActive,
  onLive,
  onReports,
  onFilters,
  onMore,
}: {
  tab: "live" | "stats";
  liveCount: number | undefined;
  menu: ChromeMenu;
  filtersActive: boolean;
  onLive: () => void;
  onReports: () => void;
  onFilters: () => void;
  onMore: () => void;
}) {
  const t = useT();
  const items = [
    {
      id: "live",
      label: t("tab.live"),
      hint: t("hint.live"),
      icon: Radio,
      active: tab === "live" && menu == null,
      onClick: onLive,
      badge: liveCount,
    },
    {
      id: "reports",
      label: t("tab.reports"),
      hint: t("hint.reports"),
      icon: BarChart3,
      active: tab === "stats" && menu == null,
      onClick: onReports,
    },
    {
      id: "filters",
      label: t("menu.filters"),
      hint: t("hint.filters"),
      icon: SlidersHorizontal,
      active: menu === "filters",
      onClick: onFilters,
      dot: filtersActive,
    },
    {
      id: "more",
      label: t("menu.more"),
      hint: t("hint.more"),
      icon: Menu,
      active: menu === "more",
      onClick: onMore,
    },
  ] as const;

  return (
    <nav
      className="atlas-dock pointer-events-auto fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/92 backdrop-blur-md"
      aria-label={t("menu.dock")}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              data-active={item.active}
              title={item.hint}
              aria-label={`${item.label}. ${item.hint}`}
              className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 text-muted data-[active=true]:text-accent"
            >
              <span className="relative">
                <Icon className="size-5" />
                {"dot" in item && item.dot ? (
                  <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-accent" />
                ) : null}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium leading-none tracking-wide">
                {item.label}
                {"badge" in item && item.badge != null ? (
                  <span className="tabular-nums text-subtle">{item.badge}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function LocateFab({
  onClick,
  locating,
  ready,
  label,
}: {
  onClick: () => void;
  locating: boolean;
  ready: boolean;
  label: string;
}) {
  const t = useT();
  return (
    <div className="pointer-events-auto flex items-center">
      <button
        type="button"
        onClick={onClick}
        disabled={locating}
        data-active={ready}
        aria-label={`${label}. ${t("hint.locate")}`}
        title={t("hint.locate")}
        className="atlas-locate-fab flex size-12 items-center justify-center shadow-float disabled:opacity-40"
      >
        <MapPin className="size-5" />
      </button>
    </div>
  );
}

export function FiltersRoll({
  open,
  onOpenChange,
  tab,
  agencyFilter,
  onAgencyFilter,
  showHistory,
  onShowHistory,
  showYesterday,
  onShowYesterday,
  liveWindow,
  onLiveWindow,
  sevFilter,
  onSevFilter,
  priorityNear,
  onPriorityNear,
  division,
  onDivision,
  divisions,
  range,
  onRange,
  against,
  onAgainst,
  group,
  onGroup,
  geography,
  onGeography,
  metric,
  onMetric,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: "live" | "stats";
  agencyFilter: AgencyFilter;
  onAgencyFilter: (a: AgencyFilter) => void;
  showHistory: boolean;
  onShowHistory: (v: boolean) => void;
  showYesterday: boolean;
  onShowYesterday: (v: boolean) => void;
  liveWindow: LiveWindow;
  onLiveWindow: (w: LiveWindow) => void;
  sevFilter: LiveSevFilter;
  onSevFilter: (s: LiveSevFilter) => void;
  priorityNear: boolean;
  onPriorityNear: (v: boolean) => void;
  division: string;
  onDivision: (d: string) => void;
  divisions: string[];
  range: RangeId;
  onRange: (r: RangeId) => void;
  against: AgainstId;
  onAgainst: (a: AgainstId) => void;
  group: string;
  onGroup: (g: string) => void;
  geography: Geography;
  onGeography: (g: Geography) => void;
  metric: Metric;
  onMetric: (m: Metric) => void;
}) {
  const t = useT();
  return (
    <RollSheet open={open} onOpenChange={onOpenChange} title={t("menu.filters")} hint={t("hint.filters")}>
      {tab === "live" ? (
        <>
          <Section title={t("menu.agency")} hint={t("hint.agency")}>
            <ChipRow>
              {(
                [
                  ["all", "agency.all"],
                  ["police", "agency.police"],
                  ["fire", "agency.fire"],
                  ["ems", "agency.ems"],
                ] as const
              ).map(([id, key]) => (
                <Button
                  key={id}
                  variant="chip"
                  size="chip"
                  data-active={agencyFilter === id}
                  onClick={() => onAgencyFilter(id)}
                >
                  {t(key)}
                </Button>
              ))}
            </ChipRow>
          </Section>
          <Section title={t("live.window")} hint={t("hint.windowLive")}>
            <ChipRow>
              {(
                [
                  ["30m", "live.window30"],
                  ["2h", "live.window2h"],
                  ["all", "live.windowAll"],
                ] as const
              ).map(([id, key]) => (
                <Button
                  key={id}
                  variant="chip"
                  size="chip"
                  data-active={liveWindow === id}
                  onClick={() => onLiveWindow(id)}
                >
                  {t(key)}
                </Button>
              ))}
            </ChipRow>
          </Section>
          <Section title={t("menu.time")} hint={t("hint.time")}>
            <ChipRow>
              <Button
                variant="chip"
                size="chip"
                data-active={showYesterday}
                onClick={() => onShowYesterday(!showYesterday)}
              >
                {t("daily.chip")}
              </Button>
              <Button
                variant="chip"
                size="chip"
                data-active={showHistory}
                onClick={() => onShowHistory(!showHistory)}
              >
                {t("live.history")}
              </Button>
            </ChipRow>
          </Section>
          <Section title={t("menu.priority")} hint={t("hint.priority")}>
            <ChipRow>
              {(
                [
                  ["all", "live.filterAll"],
                  ["high", "live.filterHigh"],
                  ["medium", "live.filterMedium"],
                  ["low", "live.filterLow"],
                ] as const
              ).map(([id, key]) => (
                <Button
                  key={id}
                  variant="chip"
                  size="chip"
                  data-active={sevFilter === id}
                  onClick={() => onSevFilter(id)}
                >
                  {t(key)}
                </Button>
              ))}
              <Button
                variant="chip"
                size="chip"
                data-active={priorityNear}
                onClick={() => onPriorityNear(!priorityNear)}
              >
                {t("live.priorityOnly")}
              </Button>
            </ChipRow>
          </Section>
          {divisions.length > 1 ? (
            <Section title={t("live.division")} hint={t("hint.division")}>
              <ChipRow>
                <Button
                  variant="chip"
                  size="chip"
                  data-active={division === "ALL"}
                  onClick={() => onDivision("ALL")}
                >
                  {t("live.division")}
                </Button>
                {divisions.map((d) => (
                  <Button
                    key={d}
                    variant="chip"
                    size="chip"
                    data-active={division === d}
                    onClick={() => onDivision(d)}
                  >
                    {d}
                  </Button>
                ))}
              </ChipRow>
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <Section title={t("menu.window")} hint={t("hint.window")}>
            <ChipRow>
              {RANGES.map((r) => (
                <Button
                  key={r.id}
                  variant="chip"
                  size="chip"
                  data-active={range === r.id}
                  onClick={() => onRange(r.id)}
                >
                  {t(r.labelKey)}
                </Button>
              ))}
            </ChipRow>
          </Section>
          <Section title={t("menu.against")} hint={t("hint.against")}>
            <ChipRow>
              {AGAINST.map((a) => (
                <Button
                  key={a.id}
                  variant="chip"
                  size="chip"
                  data-active={against === a.id}
                  onClick={() => onAgainst(a.id)}
                >
                  {t(a.labelKey)}
                </Button>
              ))}
            </ChipRow>
          </Section>
          <Section title={t("menu.groups")} hint={t("hint.groups")}>
            <ChipRow>
              {FEATURED_GROUPS.map((g) => (
                <Button
                  key={g.id}
                  variant="chip"
                  size="chip"
                  data-active={group === g.id}
                  onClick={() => onGroup(g.id)}
                >
                  {t(g.labelKey)}
                </Button>
              ))}
            </ChipRow>
            <label className="sr-only" htmlFor="more-groups">
              {t("group.more")}
            </label>
            <select
              id="more-groups"
              className="mt-2 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
              value={FEATURED_GROUPS.some((g) => g.id === group) ? "ALL" : group}
              onChange={(e) => onGroup(e.target.value)}
            >
              <option value="ALL">{t("group.more")}</option>
              {NIBRS_GROUPS.filter((g) => !FEATURED_GROUPS.some((f) => f.id === g)).map((g) => (
                <option key={g} value={g} className="bg-surface text-fg">
                  {g}
                </option>
              ))}
            </select>
          </Section>
          <Section title={t("menu.map")} hint={t("hint.map")}>
            <ChipRow>
              <Button
                variant="chip"
                size="chip"
                data-active={geography === "zip"}
                onClick={() => onGeography("zip")}
              >
                <Layers className="size-3" />
                {t("geo.zip")}
              </Button>
              <Button
                variant="chip"
                size="chip"
                data-active={geography === "area"}
                onClick={() => onGeography("area")}
              >
                {t("geo.area")}
              </Button>
              <Button
                variant="chip"
                size="chip"
                data-active={metric === "count"}
                onClick={() => onMetric("count")}
              >
                {t("metric.count")}
              </Button>
              <Button
                variant="chip"
                size="chip"
                data-active={metric === "density"}
                onClick={() => onMetric("density")}
              >
                {t("metric.density")}
              </Button>
              <Button
                variant="chip"
                size="chip"
                data-active={metric === "spike"}
                onClick={() => onMetric("spike")}
              >
                {t("metric.spike")}
              </Button>
            </ChipRow>
          </Section>
        </>
      )}
    </RollSheet>
  );
}

export function MoreRoll({
  open,
  onOpenChange,
  locale,
  onLocale,
  notify,
  notifyBlocked,
  onNotify,
  watch,
  onSelectZip,
  onRemoveWatch,
  follow,
  onRemoveFollow,
  onOpenFollow,
  onPdf,
  onCsv,
  onShare,
  onLocate,
  locateLabel,
  onHowTo,
  onContact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  onLocale: (l: Locale) => void;
  notify: boolean;
  notifyBlocked: boolean;
  onNotify: () => void;
  watch: WatchItem[];
  onSelectZip: (zip: string) => void;
  onRemoveWatch: (key: string) => void;
  follow: FollowItem[];
  onRemoveFollow: (id: string) => void;
  onOpenFollow: (item: FollowItem) => void;
  onPdf: () => void;
  onCsv: () => void;
  onShare: () => void;
  onLocate: () => void;
  locateLabel: string;
  onHowTo: () => void;
  onContact: () => void;
}) {
  const t = useT();
  return (
    <RollSheet open={open} onOpenChange={onOpenChange} title={t("menu.more")} hint={t("hint.more")}>
      <Section title={t("menu.language")} hint={t("hint.language")}>
        <ChipRow>
          {(["en", "es"] as Locale[]).map((code) => (
            <Button
              key={code}
              variant="chip"
              size="chip"
              data-active={locale === code}
              onClick={() => onLocale(code)}
            >
              {t(`lang.${code}`)}
            </Button>
          ))}
        </ChipRow>
      </Section>
      <Section title={t("menu.alerts")} hint={t("hint.alerts")}>
        <div className="flex items-center gap-0.5 px-1">
          <Button
            variant="outline"
            className="min-w-0 flex-1 justify-start"
            data-active={notify}
            onClick={onNotify}
            disabled={notifyBlocked}
          >
            {notifyBlocked ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            {notifyBlocked ? t("notify.blocked") : notify ? t("notify.enabled") : t("notify.enable")}
          </Button>
          <Hint title={t("menu.alerts")} body={t("hint.alerts")} />
        </div>
        <p className="mt-2 px-2 text-xs leading-relaxed text-subtle">{t("notify.hint")}</p>
      </Section>
      <Section title={t("menu.follow")} hint={t("hint.follow")}>
        {follow.length === 0 ? (
          <p className="px-2 text-sm text-muted">{t("follow.empty")}</p>
        ) : (
          <ul className="space-y-1 px-1">
            {follow.map((f) => (
              <li key={f.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 rounded-md px-2 py-2 text-left"
                  onClick={() => onOpenFollow(f)}
                >
                  <span className="block truncate text-sm text-fg">{f.title}</span>
                  <span className="block truncate text-xs text-subtle">
                    {f.status === "cleared" ? t("follow.cleared") : f.subtitle}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex size-11 shrink-0 items-center justify-center text-muted"
                  onClick={() => onRemoveFollow(f.id)}
                  aria-label={t("follow.following")}
                >
                  <Bookmark className="size-4 fill-accent text-accent" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 px-2 text-xs leading-relaxed text-subtle">{t("follow.hint")}</p>
      </Section>
      <Section title={t("menu.places")} hint={t("hint.places")}>
        {watch.length === 0 ? (
          <p className="px-2 text-sm text-muted">{t("watch.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1 px-1">
            {watch.map((w) => {
              const key = watchKey(w);
              const label = w.address ? w.name || w.address : w.zip;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => w.zip && onSelectZip(w.zip)}
                    className="inline-flex h-11 max-w-[14rem] items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-sm text-fg"
                  >
                    {w.address ? <Building2 className="size-3.5 shrink-0 text-accent" /> : <Star className="size-3.5 shrink-0 text-accent" />}
                    <span className="truncate">{label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="flex size-8 items-center justify-center text-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWatch(key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveWatch(key);
                        }
                      }}
                      aria-label={t("watch.remove", { zip: label })}
                    >
                      ×
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title={t("menu.export")} hint={t("hint.pdf")}>
        <div className="flex flex-col gap-2 px-1">
          <div className="flex items-center gap-0.5">
            <Button variant="outline" className="min-w-0 flex-1 justify-start" onClick={onPdf}>
              <FileDown className="size-4" />
              {t("pdf.report")}
            </Button>
            <Hint title={t("pdf.report")} body={t("hint.pdf")} />
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" className="min-w-0 flex-1 justify-start" onClick={onCsv}>
              <FileDown className="size-4" />
              {t("csv.label")}
            </Button>
            <Hint title={t("csv.label")} body={t("hint.csv")} />
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" className="min-w-0 flex-1 justify-start" onClick={onShare}>
              <Share2 className="size-4" />
              {t("share.label")}
            </Button>
            <Hint title={t("share.label")} body={t("hint.share")} />
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="outline" className="min-w-0 flex-1 justify-start" onClick={onLocate}>
              <MapPin className="size-4" />
              {locateLabel}
            </Button>
            <Hint title={t("locate.near")} body={t("hint.locate")} />
          </div>
        </div>
      </Section>
      <Section title={t("menu.about")} hint={t("hint.about")}>
        <div className="flex flex-col gap-2 px-1">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              onOpenChange(false);
              onHowTo();
            }}
          >
            <BookOpen className="size-4" />
            {t("howto.replay")}
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              onOpenChange(false);
              onContact();
            }}
          >
            <MessageSquare className="size-4" />
            {t("howto.contactCta")}
          </Button>
        </div>
        <p className="mt-3 px-2 text-sm leading-relaxed text-muted">{t("live.disclaimer")}</p>
      </Section>
    </RollSheet>
  );
}

export function SearchRoll({
  open,
  onOpenChange,
  query,
  onQuery,
  hits,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQuery: (q: string) => void;
  hits: SearchHit[];
  onPick: (hit: SearchHit) => void;
}) {
  const t = useT();
  return (
    <RollSheet open={open} onOpenChange={onOpenChange} title={t("menu.search")} hint={t("hint.search")}>
      <div className="relative px-1 pb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("menu.search")}
          autoFocus={open}
          className="h-12 w-full rounded-md border border-border bg-bg pl-10 pr-3 text-base text-fg placeholder:text-subtle"
        />
      </div>
      {hits.length === 0 && query.trim().length >= 2 ? (
        <p className="px-3 text-sm text-muted">{t("search.empty")}</p>
      ) : (
        <ul className="px-1">
          {hits.map((hit) => {
            const key =
              hit.kind === "zip"
                ? `zip-${hit.zip}-${hit.name}`
                : hit.kind === "group"
                  ? `group-${hit.id}`
                  : hit.kind === "offense"
                    ? hit.name
                    : hit.kind === "street"
                      ? hit.street
                      : hit.id;
            const label =
              hit.kind === "zip"
                ? hit.name
                : hit.kind === "group" || hit.kind === "offense"
                  ? hit.name
                  : hit.kind === "street"
                    ? hit.street
                    : hit.problem;
            const meta =
              hit.kind === "zip"
                ? hit.zip
                : hit.kind === "group"
                  ? t("menu.groups")
                  : hit.kind === "offense"
                    ? String(hit.n)
                    : hit.kind === "street"
                      ? t("search.street")
                      : hit.zip || t("search.live");
            return (
              <li key={key}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between gap-2 rounded-md px-3 text-left hover:bg-surface-2"
                  onClick={() => onPick(hit)}
                >
                  <span className="min-w-0 truncate text-sm">{label}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted">{meta}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </RollSheet>
  );
}

