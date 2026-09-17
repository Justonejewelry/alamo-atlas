import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "es";

export type WatchItem = {
  zip: string;
  name: string;
  address?: string;
  street?: string;
};

export type FollowItem = {
  kind: "call" | "report";
  id: string;
  title: string;
  subtitle: string;
  fingerprint: string;
  status: "open" | "cleared";
  since: number;
  clearedAt?: number;
};

type Prefs = {
  locale: Locale;
  watch: WatchItem[];
  follow: FollowItem[];
  notify: boolean;
  digestAt: number | null;
  seenIntro: boolean;
  seenHowTo: boolean;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  addWatch: (item: WatchItem) => void;
  removeWatch: (key: string) => void;
  addFollow: (item: FollowItem) => void;
  removeFollow: (id: string) => void;
  markFollow: (id: string, patch: Partial<FollowItem>) => void;
  setNotify: (notify: boolean) => void;
  markDigest: () => void;
  dismissIntro: () => void;
  dismissHowTo: () => void;
  markHydrated: () => void;
};

const MAX_WATCH = 12;
const MAX_FOLLOW = 12;

export function watchKey(item: WatchItem): string {
  return item.address ? `p:${item.address.toUpperCase()}` : `z:${item.zip}`;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set, get) => ({
      locale: "en",
      watch: [],
      follow: [],
      notify: false,
      digestAt: null,
      seenIntro: false,
      seenHowTo: false,
      hydrated: false,
      setLocale: (locale) => set({ locale }),
      addWatch: (item) => {
        const zip = item.zip.replace(/\D/g, "").slice(0, 5);
        if (item.address) {
          const address = item.address.replace(/\s+/g, " ").trim();
          if (!address) return;
          const key = watchKey({ ...item, address });
          const rest = get().watch.filter((w) => watchKey(w) !== key);
          const next = [
            ...rest,
            {
              zip: /^\d{5}$/.test(zip) ? zip : item.zip,
              name: item.name || address,
              address,
              street: item.street,
            },
          ].slice(-MAX_WATCH);
          set({ watch: next });
          return;
        }
        if (!/^\d{5}$/.test(zip)) return;
        const rest = get().watch.filter((w) => w.zip !== zip || w.address);
        const next = [...rest, { zip, name: item.name }].slice(-MAX_WATCH);
        set({ watch: next });
      },
      removeWatch: (key) =>
        set({
          watch: get().watch.filter((w) => watchKey(w) !== key && !(w.zip === key && !w.address)),
        }),
      addFollow: (item) => {
        const rest = (get().follow ?? []).filter((f) => f.id !== item.id);
        set({ follow: [...rest, item].slice(-MAX_FOLLOW) });
      },
      removeFollow: (id) => set({ follow: (get().follow ?? []).filter((f) => f.id !== id) }),
      markFollow: (id, patch) =>
        set({
          follow: (get().follow ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }),
      setNotify: (notify) => set({ notify }),
      markDigest: () => set({ digestAt: Date.now() }),
      dismissIntro: () => set({ seenIntro: true, seenHowTo: true }),
      dismissHowTo: () => set({ seenHowTo: true, seenIntro: true }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "alamo-atlas-prefs",
      skipHydration: true,
      partialize: (s) => ({
        locale: s.locale,
        watch: s.watch,
        follow: s.follow,
        notify: s.notify,
        digestAt: s.digestAt,
        seenIntro: s.seenIntro,
        seenHowTo: s.seenHowTo,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

export const WATCH_CAP = MAX_WATCH;
export const FOLLOW_CAP = MAX_FOLLOW;
