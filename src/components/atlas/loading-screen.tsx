import { useT } from "@/lib/crime/i18n";

const FOIA_LEARN_MORE =
  "https://www.justice.gov/oip/freedom-information-act-overview";

/**
 * Loading overlay with house ad: FOIA / public-records rights placeholder.
 * Shown while the live board (or first paint) is still resolving.
 */
export function LoadingScreen({
  open,
  progressLabel,
}: {
  open: boolean;
  /** Optional status line under the title */
  progressLabel?: string;
}) {
  const t = useT();
  if (!open) return null;

  return (
    <div
      className="atlas-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t("loading.title")}
    >
      <div className="atlas-loading-bg" aria-hidden="true" />

      <div className="atlas-loading-body">
        <img
          src="/logo.jpg"
          alt=""
          width={96}
          height={96}
          className="atlas-logo-3d size-24 rounded-full object-cover"
        />
        <h1 className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none tracking-tight text-fg">
          Alamo Atlas
        </h1>
        <p className="mt-2 text-sm text-muted">{progressLabel ?? t("loading.board")}</p>
        <div className="atlas-loading-bar" aria-hidden="true">
          <span />
        </div>

        <aside className="atlas-ad-card" aria-label={t("loading.adLabel")}>
          <span className="atlas-ad-badge">{t("loading.adBadge")}</span>
          <p className="font-display text-[clamp(1.2rem,3.5vw,1.45rem)] leading-snug tracking-tight text-fg text-balance">
            {t("loading.adHeadline")}
          </p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-muted text-pretty">
            {t("loading.adBody")}
          </p>
          <a
            href={FOIA_LEARN_MORE}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-border-strong px-4 text-sm text-fg hover:bg-surface-2"
          >
            {t("loading.learnMore")}
          </a>
        </aside>
      </div>

      <p className="atlas-loading-foot">{t("start.disclaimer")}</p>
    </div>
  );
}
