import { MapPin } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/crime/i18n";
import { cn } from "@/lib/utils";

/**
 * Night Map Hero start screen — first-run location gate.
 * Matches product mock: dark city, beveled Chica, magenta primary / outline secondary.
 */
export function StartScreen({
  open,
  onLocate,
  onSaveZip,
  onSkip,
}: {
  open: boolean;
  onLocate: () => void;
  onSaveZip: (zip: string) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const [zip, setZip] = useState("");
  const [zipMode, setZipMode] = useState(false);
  const validZip = /^\d{5}$/.test(zip);

  if (!open) return null;

  return (
    <div
      className="atlas-start"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="atlas-start-bg" aria-hidden="true" />
      <div className="atlas-start-vignette" aria-hidden="true" />

      <div className="atlas-start-body">
        <img
          src="/logo.jpg"
          alt=""
          width={120}
          height={120}
          className="atlas-logo-3d size-[7.5rem] rounded-full object-cover"
        />

        <h1 id={titleId} className="atlas-start-title font-display">
          Alamo Atlas
        </h1>
        <p className="atlas-start-sub">{t("start.tagline")}</p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 px-1">
          {!zipMode ? (
            <>
              <Button
                className="atlas-cta-primary h-12 w-full justify-center text-base"
                onClick={onLocate}
              >
                <MapPin className="size-5" />
                {t("intro.locate")}
              </Button>
              <Button
                variant="outline"
                className="atlas-cta-outline h-12 w-full text-base"
                onClick={() => setZipMode(true)}
              >
                {t("start.enterZip")}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && validZip) {
                      e.preventDefault();
                      onSaveZip(zip);
                    }
                  }}
                  placeholder={t("intro.zipPh")}
                  inputMode="numeric"
                  autoFocus
                  aria-label={t("start.enterZip")}
                  className="h-12 min-w-0 flex-1 rounded-full border border-border-strong bg-surface/90 px-5 text-lg tabular-nums text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <Button
                  className="atlas-cta-primary h-12 min-w-20 text-base"
                  disabled={!validZip}
                  onClick={() => onSaveZip(zip)}
                >
                  {t("start.go")}
                </Button>
              </div>
              <button
                type="button"
                className="min-h-11 text-sm text-muted hover:text-fg"
                onClick={() => setZipMode(false)}
              >
                {t("howto.back")}
              </button>
            </>
          )}

          <button
            type="button"
            className={cn("min-h-11 text-sm text-muted hover:text-fg", zipMode && "sr-only")}
            onClick={onSkip}
          >
            {t("start.skip")}
          </button>
        </div>
      </div>

      <p className="atlas-start-foot">{t("start.disclaimer")}</p>
    </div>
  );
}
