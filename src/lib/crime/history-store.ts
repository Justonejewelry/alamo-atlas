import { pruneHistory, type LiveCall } from "./cad-parse";

export { digestCalls, mergeHistory, overnightCutoff } from "./cad-parse";

const KEY = "alamo-atlas-history-v1";

export function loadLocalHistory(): LiveCall[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return pruneHistory(raw as LiveCall[]);
  } catch {
    return [];
  }
}

export function saveLocalHistory(calls: LiveCall[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pruneHistory(calls)));
  } catch {
    /* quota */
  }
}
