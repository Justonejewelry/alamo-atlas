import { BookOpen, Check, ChevronLeft, FileDown, MapPin, MessageSquare, Radio, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/crime/i18n";
import { cn } from "@/lib/utils";

const CONTACT_X = "justinraineys";

export const HOWTO_IDS = ["welcome", "live", "reports", "contact"] as const;
export type HowToId = (typeof HOWTO_IDS)[number];

const STEPS: Array<{ id: HowToId; icon: typeof Radio }> = [
  { id: "welcome", icon: BookOpen },
  { id: "live", icon: Radio },
  { id: "reports", icon: FileDown },
  { id: "contact", icon: MessageSquare },
];

type Topic = "comment" | "question" | "business";

export function HowTo({
  open,
  startAt = 0,
  onSkipNow,
  onSkipNext,
  onLocate,
  onSaveZip,
}: {
  open: boolean;
  startAt?: number;
  onSkipNow: () => void;
  onSkipNext: () => void;
  onLocate: () => void;
  onSaveZip: (zip: string) => void;
}) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [zip, setZip] = useState("");
  const [skipNext, setSkipNext] = useState(false);
  const titleId = useId();
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(Math.min(Math.max(0, startAt), STEPS.length - 1));
    setSkipNext(false);
  }, [open, startAt]);

  function leave(persist: boolean) {
    if (persist || skipNext) onSkipNext();
    else onSkipNow();
  }

  const last = step === STEPS.length - 1;

  function next() {
    if (last) {
      leave(true);
      return;
    }
    setStep((n) => n + 1);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        leave(false);
        return;
      }
      if (e.key === "ArrowRight") setStep((n) => Math.min(STEPS.length - 1, n + 1));
      if (e.key === "ArrowLeft") setStep((n) => Math.max(0, n - 1));
      if (e.key === "Enter") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
        e.preventDefault();
        if (step === STEPS.length - 1) leave(true);
        else setStep((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onSkipNow, onSkipNext, skipNext, step]);

  if (!open) return null;

  const current = STEPS[step]!;
  const Icon = current.icon;
  const validZip = /^\d{5}$/.test(zip);

  function onTouchStart(e: React.TouchEvent) {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, button, a, label")) return;
    const tch = e.changedTouches[0];
    if (!tch) return;
    touchRef.current = { x: tch.clientX, y: tch.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const tch = e.changedTouches[0];
    if (!tch) return;
    const dx = tch.clientX - start.x;
    const dy = tch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
    if (dx < 0) next();
    else if (step > 0) setStep((n) => n - 1);
  }

  return (
    <div
      className="atlas-howto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:px-6">
        <img src="/logo.jpg" alt="" width={40} height={40} className="size-10 rounded-full object-cover ring-1 ring-accent/40" />
        <div className="min-w-0 flex-1">
          <p className="atlas-kicker hidden md:block">{t("howto.kicker")}</p>
          <h2 id={titleId} className="truncate font-display text-xl leading-none tracking-tight md:text-2xl">
            {t("howto.title")}
          </h2>
        </div>
        <p className="shrink-0 text-base tabular-nums text-muted">
          {t("howto.progress", { n: step + 1, total: STEPS.length })}
        </p>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center text-muted"
          onClick={() => leave(false)}
          aria-label={t("howto.skipNow")}
        >
          <X className="size-6" />
        </button>
      </header>

      <div className="howto-progress" aria-hidden="true">
        <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <nav className="hidden shrink-0 gap-2 overflow-x-auto px-6 py-3 md:flex" aria-label={t("howto.title")}>
        {STEPS.map((s, i) => {
          const NavIcon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              data-active={i === step}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted",
                i === step && "border-accent bg-accent/10 text-fg",
                i < step && "text-fg",
              )}
            >
              {i < step ? <Check className="size-4 text-accent" /> : <NavIcon className="size-4" />}
              {t(`howto.step.${s.id}.nav`)}
            </button>
          );
        })}
      </nav>

      <div className="howto-stage panel-scroll">
        <div key={current.id} className="howto-copy">
          <p className="howto-index" aria-hidden="true">
            {String(step + 1).padStart(2, "0")}
          </p>
          <p className="atlas-kicker">{t(`howto.step.${current.id}.nav`)}</p>
          <h3 className="howto-headline mt-2">
            <Icon className="howto-mark" aria-hidden="true" />
            {t(`howto.step.${current.id}.title`)}
          </h3>
          <p className="howto-lede">{t(`howto.step.${current.id}.body`)}</p>
          {current.id === "welcome" ? (
            <div className="mt-6 flex flex-col gap-3">
              <Button className="h-12 w-full justify-start text-base" onClick={onLocate}>
                <MapPin className="size-5" />
                {t("intro.locate")}
              </Button>
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
                  aria-label={t("intro.zip")}
                  className="h-12 min-w-0 flex-1 rounded-md border border-border bg-surface px-4 text-lg text-fg"
                />
                <Button className="h-12 text-base" disabled={!validZip} onClick={() => onSaveZip(zip)}>
                  {t("intro.zip")}
                </Button>
              </div>
            </div>
          ) : null}
          {current.id === "contact" ? <ContactForm /> : null}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-6">
        <button
          type="button"
          role="checkbox"
          aria-checked={skipNext}
          onClick={() => setSkipNext((v) => !v)}
          className="inline-flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left text-base leading-snug text-muted hover:text-fg md:flex-none"
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-xs border border-border-strong",
              skipNext && "border-accent bg-accent",
            )}
          >
            {skipNext ? <Check className="size-3.5 text-accent-fg" /> : null}
          </span>
          <span className="md:hidden">{t("howto.skipNextShort")}</span>
          <span className="hidden md:inline">{t("howto.skipNext")}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          disabled={step === 0}
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          aria-label={t("howto.back")}
          className="size-12 shrink-0 md:h-12 md:w-auto md:px-5"
        >
          <ChevronLeft className="size-6 md:hidden" />
          <span className="hidden text-base md:inline">{t("howto.back")}</span>
        </Button>
        <Button onClick={next} className="h-12 min-w-32 flex-1 text-base md:flex-none md:min-w-40">
          {last ? t("howto.done") : t("howto.next")}
        </Button>
      </footer>
    </div>
  );
}

function ContactForm() {
  const t = useT();
  const [topic, setTopic] = useState<Topic>("comment");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  const payload = [
    `@${CONTACT_X}`,
    t(`howto.contact.${topic}`),
    name.trim() ? name.trim() : "",
    message.trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  function openX() {
    if (message.trim().length < 4) {
      toast(t("howto.contact.need"));
      return;
    }
    const url = `https://x.com/intent/post?text=${encodeURIComponent(payload)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyMsg() {
    if (message.trim().length < 4) {
      toast(t("howto.contact.need"));
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      toast(t("howto.contact.copied"));
    } catch {
      toast(payload);
    }
  }

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        openX();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(["comment", "question", "business"] as Topic[]).map((id) => (
          <Button
            key={id}
            type="button"
            variant="chip"
            size="chip"
            data-active={topic === id}
            onClick={() => setTopic(id)}
            className="h-11 px-4 text-base"
          >
            {t(`howto.contact.${id}`)}
          </Button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 80))}
        placeholder={t("howto.contact.name")}
        autoComplete="name"
        className="h-12 w-full rounded-md border border-border bg-surface px-4 text-lg text-fg placeholder:text-subtle"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 500))}
        placeholder={t("howto.contact.message")}
        rows={4}
        className="w-full rounded-md border border-border bg-surface px-4 py-3 text-lg text-fg placeholder:text-subtle"
      />
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1 text-base">
          <XLogo />
          {t("howto.contact.send")}
        </Button>
        <Button type="button" variant="outline" className="h-12 text-base" onClick={() => void copyMsg()}>
          {t("howto.contact.copy")}
        </Button>
      </div>
      <a
        href={`https://x.com/${CONTACT_X}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-12 items-center text-base text-accent"
      >
        {t("howto.contact.profile")}
      </a>
    </form>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.727-8.83L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
