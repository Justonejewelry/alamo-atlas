import { useState } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber, groupLabel } from "@/lib/crime/format";
import { useT } from "@/lib/crime/i18n";
import { reportFingerprint } from "@/lib/crime/follow";
import { FOLLOW_CAP, usePrefs, type FollowItem } from "@/lib/crime/prefs";
import { registerAtlasAlerts, requestQuietAlerts } from "@/lib/crime/notify";
import type { OffenseList, OffenseReport } from "@/lib/crime/types";
import { cn } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="atlas-kicker">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{value || "—"}</dd>
    </div>
  );
}

export function ReportsList({
  list,
  loading,
  nameFilter,
  zip,
  onSelectZip,
  onClearName,
}: {
  list: OffenseList | undefined;
  loading: boolean;
  nameFilter: string;
  zip: string | null;
  onSelectZip: (zip: string) => void;
  onClearName: () => void;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const follow = usePrefs((s) => s.follow) ?? [];
  const addFollow = usePrefs((s) => s.addFollow);
  const removeFollow = usePrefs((s) => s.removeFollow);
  const watch = usePrefs((s) => s.watch);
  const followingIds = new Set(follow.map((f) => f.id));
  const reports = list?.reports ?? [];

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="atlas-kicker">{t("reports.title")}</h3>
        {list ? (
          <span className="text-xs tabular-nums text-subtle">
            {formatNumber(Math.min(reports.length, list.matched))}
            {list.matched > reports.length ? ` of ${formatNumber(list.matched)}` : ""}
          </span>
        ) : null}
      </div>
      {nameFilter ? (
        <button
          type="button"
          onClick={onClearName}
          className="mt-2 inline-flex min-h-11 items-center rounded-full border border-accent/40 bg-accent/10 px-3 text-xs text-accent"
        >
          {t("reports.name", { name: nameFilter })}
        </button>
      ) : null}
      <p className="mt-2 text-xs text-subtle">
        {t("reports.everyField")}
        {zip ? ` ${t("reports.inZip", { zip })}` : ""}. {t("reports.searchHint")} {t("reports.privacy")}
      </p>

      {loading && reports.length === 0 ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : reports.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("reports.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {reports.map((r, i) => (
            <ReportRow
              key={`${r.id}-${r.reportDate}-${r.zip}-${i}`}
              report={r}
              open={openId === r.id}
              onToggle={() => setOpenId((id) => (id === r.id ? null : r.id))}
              onSelectZip={onSelectZip}
              following={followingIds.has(r.id)}
              onToggleFollow={async (report) => {
                if (followingIds.has(report.id)) {
                  removeFollow(report.id);
                  toast(t("follow.toastOff"));
                  return;
                }
                if (follow.length >= FOLLOW_CAP) {
                  toast(t("follow.cap"));
                  return;
                }
                const item: FollowItem = {
                  kind: "report",
                  id: report.id,
                  title: report.codeName || "Offense",
                  subtitle: [report.zip, report.area].filter(Boolean).join(" · "),
                  fingerprint: reportFingerprint(report),
                  status: "open",
                  since: Date.now(),
                };
                addFollow(item);
                toast(t("follow.toastOn"), { description: item.subtitle });
                const ok = await requestQuietAlerts();
                if (ok) void registerAtlasAlerts(watch, [...follow.filter((f) => f.id !== item.id), item]);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportRow({
  report,
  open,
  onToggle,
  onSelectZip,
  following,
  onToggleFollow,
}: {
  report: OffenseReport;
  open: boolean;
  onToggle: () => void;
  onSelectZip: (zip: string) => void;
  following?: boolean;
  onToggleFollow?: (report: OffenseReport) => void;
}) {
  const t = useT();
  return (
    <li>
      <button type="button" onClick={onToggle} className="flex min-h-12 w-full flex-col justify-center py-3 text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm text-fg">{report.codeName || "Offense"}</span>
          <span className="shrink-0 text-xs tabular-nums text-subtle">{formatDate(report.reportDate)}</span>
        </span>
        <span className="mt-0.5 text-xs text-muted">
          {report.zip}
          {report.area ? ` · ${report.area}` : ""}
          {report.against ? ` · ${report.against.toLowerCase()}` : ""}
        </span>
      </button>
      <dl className={cn("grid-cols-2 gap-x-3 gap-y-2 overflow-hidden pb-3", open ? "grid" : "hidden")}>
        <Field label={t("reports.id")} value={report.id} />
        <Field label={t("reports.date")} value={formatDate(report.reportDate)} />
        <Field label={t("reports.offense")} value={report.codeName} />
        <Field label={t("reports.against")} value={report.against} />
        <Field label={t("reports.group")} value={groupLabel(report.group, t.locale) || report.group} />
        <Field label={t("reports.area")} value={report.area} />
        <Field label={t("reports.zip")} value={report.zip || "—"} />
        <Field label={t("reports.datetime")} value={report.dateTime ? formatDate(report.dateTime) : "—"} />
        <div className="col-span-2 flex flex-wrap gap-3">
          {report.zip ? (
            <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={() => onSelectZip(report.zip)}>
              {t("watch.add", { zip: report.zip })}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-accent"
            data-atlas="follow"
            onClick={() => onToggleFollow?.(report)}
          >
            <Bookmark className={cn("size-4", following && "fill-accent")} />
            {following ? t("follow.following") : t("follow.report")}
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm text-accent"
            onClick={() => {
              void import("@/lib/crime/pdf").then((m) => m.reportPdf(report));
            }}
          >
            {t("pdf.report")}
          </button>
        </div>
      </dl>
    </li>
  );
}
