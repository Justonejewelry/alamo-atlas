import type { FollowItem, Locale, WatchItem } from "./prefs";
import { t } from "./i18n";
import type { LiveCall } from "./live";

export async function requestQuietAlerts(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const next = await Notification.requestPermission();
  return next === "granted";
}

export async function registerAtlasAlerts(
  watch: WatchItem[],
  follow: FollowItem[] = [],
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/atlas-sw.js");
    await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "watch", watch, follow });
    const periodic = (reg as ServiceWorkerRegistration & { periodicSync?: { register: Function } }).periodicSync;
    if (periodic && typeof periodic.register === "function") {
      try {
        await periodic.register("atlas-live", { minInterval: 15 * 60 * 1000 });
      } catch {
        /* unsupported or not installed */
      }
    }
    const bgSync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (bgSync && typeof bgSync.register === "function") {
      try {
        await bgSync.register("atlas-live");
      } catch {
        /* unsupported */
      }
    }
    return reg;
  } catch {
    return null;
  }
}

export function notifyCalls(calls: LiveCall[], locale: Locale): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
  for (const c of calls.slice(0, 3)) {
    const title = c.problem;
    const body = t(locale, "notify.body", { address: c.address || "San Antonio", zip: c.zip || "" });
    if (sw) {
      sw.postMessage({ type: "notify", title, body, tag: c.id });
      continue;
    }
    try {
      new Notification(title, { body, icon: "/logo.jpg", tag: c.id });
    } catch {
      /* ignore */
    }
  }
}

export function notifyFollow(title: string, body: string, tag: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
  if (sw) {
    sw.postMessage({ type: "notify", title, body, tag });
    return;
  }
  try {
    new Notification(title, { body, icon: "/logo.jpg", tag });
  } catch {
    /* ignore */
  }
}
