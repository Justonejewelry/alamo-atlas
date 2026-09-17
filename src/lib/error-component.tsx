import type { ErrorComponentProps } from "@tanstack/react-router";

export function AppErrorComponent({ reset }: ErrorComponentProps) {
  function retry() {
    try {
      reset();
    } catch {
      /* reset is best-effort */
    }
    window.location.reload();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-6 text-center text-fg">
      <p className="atlas-kicker">Alamo Atlas</p>
      <h1 className="max-w-lg font-display text-4xl leading-tight tracking-tight md:text-5xl">
        The board could not load.
      </h1>
      <p className="max-w-md text-lg leading-relaxed text-muted">
        Public SAPD and SAFD data is still there. Reload and Atlas will try again.
      </p>
      <button
        type="button"
        onClick={retry}
        className="inline-flex h-12 min-w-36 items-center justify-center rounded-md bg-accent px-5 text-base font-medium text-accent-fg"
      >
        Try again
      </button>
    </main>
  );
}
