export type CallSeverity = "high" | "medium" | "low";
export type CallAgency = "police" | "fire" | "ems";
export type GeoQuality = "block" | "zip" | "none";
export type LiveWindow = "30m" | "2h" | "all";

export type LiveCall = {
  id: string;
  when: string;
  whenMs: number;
  problem: string;
  address: string;
  street: string;
  zip: string;
  division: string;
  severity: CallSeverity;
  agency: CallAgency;
  units?: number;
  tac?: string;
  crossStreet?: string;
  locationType?: string;
  lat?: number;
  lng?: number;
  geo?: GeoQuality;
  camera?: { id: string; name: string; roadway: string; miles: number; lat?: number; lng?: number };
  txdot?: { id: string; summary: string };
  /** Public CAD problem as the caller titled it — not a 911 audio transcript. */
  asCalledIn?: string;
  category?: string;
};

export const HIGH =
  /\b(gun|shoot|shot|stab|cutting|holdup|robbery|burglary in progress|fight|assault|kidnap|abduct|bomb|explos|pursuit|weapon|hostage|rape|arson|structure fire|working fire|rescue|overdose|choking|not breathing|cardiac|unconscious|drowning|hazmat|gas leak)\b/i;
export const MEDIUM =
  /\b(disturbance|welfare|missing|alarm|crash|accident|collision|mvc|theft|suspicious|threat|harass|family|neighbor|traffic|intoxicated|want.?ed person|medical|trauma|sick|assist public|vehicle fire|other fire|brush)\b/i;

export function classifyProblem(problem: string): CallSeverity {
  if (HIGH.test(problem)) return "high";
  if (MEDIUM.test(problem)) return "medium";
  return "low";
}

export function withinLiveWindow(whenMs: number, window: LiveWindow, now = Date.now()): boolean {
  if (window === "all") return true;
  const span = window === "30m" ? 30 * 60_000 : 2 * 60 * 60_000;
  return now - whenMs <= span;
}

export function streetOf(address: string): string {
  return address.replace(/^\d+\s+/, "").replace(/\s+\d{5}\s*$/, "").trim();
}

export function hidden(html: string, name: string): string {
  const re = new RegExp(`(?:name|id)="${name}"[^>]*value="([^"]*)"`, "i");
  return re.exec(html)?.[1] ?? "";
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function parseSaDate(raw: string, now = Date.now()): number {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) {
    const rfc = Date.parse(raw);
    return Number.isFinite(rfc) ? rfc : now;
  }
  let hour = Number(m[4]);
  const pm = m[7]!.toUpperCase() === "PM";
  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  const iso = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${m[5]}:${m[6]}-05:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : now;
}

function makeId(agency: CallAgency, whenMs: number, address: string): string {
  const prefix = agency === "police" ? "SAPD" : agency === "fire" ? "SAFD-F" : "SAFD-E";
  return `${prefix}-${whenMs}-${address.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 18)}`;
}

export function parsePolice(html: string): LiveCall[] {
  const table = /id="gvCalls"[\s\S]*?<\/table>/i.exec(html)?.[0] ?? html;
  const out: LiveCall[] = [];
  const seen = new Set<string>();
  for (const row of table.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
    const tr = row[0];
    const idm = /SAPD-(\d{4}-\d+)/.exec(tr);
    if (!idm) continue;
    const id = `SAPD-${idm[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const qm = /maps\?q=([^"']+)/i.exec(tr);
    const q = decodeURIComponent((qm?.[1] ?? "").replace(/\+/g, " ")).replace(/&/g, "&");
    const zipMatch = q.match(/(\d{5})\s*$/);
    const zip = zipMatch?.[1] ?? "";
    const address = q.replace(/\s*\d{5}\s*$/, "").trim();
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    const when = cells[2] ?? "";
    const problem = cells[3] || "Call";
    const division = cells[5] ?? "";
    const addr = address || cells[4] || "";
    out.push({
      id,
      when,
      whenMs: parseSaDate(when),
      problem,
      address: addr,
      street: streetOf(addr),
      zip,
      division,
      severity: classifyProblem(problem),
      agency: "police",
    });
  }
  return out;
}

export function parseSafd(html: string, agency: "fire" | "ems"): LiveCall[] {
  const table = /id="GridView2"[\s\S]*?<\/table>/i.exec(html)?.[0] ?? "";
  const out: LiveCall[] = [];
  const seen = new Set<string>();
  for (const row of table.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
    const tr = row[0];
    if (/<th/i.test(tr)) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 7) continue;
    const units = Number(cells[0]) || undefined;
    const when = cells[1] ?? "";
    const problem = cells[2] || (agency === "fire" ? "Fire call" : "EMS call");
    const qm = /maps\?q=([^"']+)/i.exec(tr);
    const q = decodeURIComponent((qm?.[1] ?? "").replace(/\+/g, " "));
    const zipFromQ = q.match(/(\d{5})\s*$/)?.[1] ?? "";
    const addrFromQ = q.replace(/\s*\d{5}\s*$/, "").trim();
    const address = addrFromQ || cells[3] || "";
    const zip = zipFromQ || cells[6] || "";
    if (!address && !when) continue;
    const whenMs = parseSaDate(when);
    const id = makeId(agency, whenMs, address);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      when,
      whenMs,
      problem,
      address,
      street: streetOf(address),
      zip,
      division: cells[7] ?? "",
      severity: classifyProblem(problem),
      agency,
      units,
      tac: cells[7] || undefined,
      crossStreet: cells[4] || undefined,
      locationType: cells[5] || undefined,
    });
  }
  return out;
}

export function parseSafd72(html: string): { calls: LiveCall[]; unavailable: boolean } {
  if (/not available at this time/i.test(html)) return { calls: [], unavailable: true };
  return { calls: parseSafd(html, "fire"), unavailable: false };
}

export function parseTacc(json: unknown): LiveCall[] {
  const root = json as { rss?: { channel?: { item?: unknown } } };
  const raw = root?.rss?.channel?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: LiveCall[] = [];
  for (const item of items) {
    const rec = item as { title?: string; description?: string; pubDate?: string };
    const desc = String(rec.description ?? "");
    const [addrPart] = desc.split("|");
    const address = (addrPart ?? "").trim();
    if (!address) continue;
    const problem = String(rec.title ?? "Fire").trim() || "Fire";
    const when = String(rec.pubDate ?? "");
    const whenMs = parseSaDate(when);
    const zip = address.match(/(\d{5})\s*$/)?.[1] ?? "";
    const addr = address.replace(/\s*\d{5}\s*$/, "").trim();
    out.push({
      id: makeId("fire", whenMs, addr),
      when,
      whenMs,
      problem,
      address: addr,
      street: streetOf(addr),
      zip,
      division: "SAFD",
      severity: classifyProblem(problem),
      agency: "fire",
    });
  }
  return out;
}

export function mergeBoards(police: LiveCall[], fire: LiveCall[], ems: LiveCall[]): LiveCall[] {
  const fireKeys = new Set(fire.map((c) => `${c.address.toUpperCase()}|${c.zip}`));
  const out = [...police, ...fire];
  const seen = new Set(out.map((c) => c.id));
  for (const c of ems) {
    if (fireKeys.has(`${c.address.toUpperCase()}|${c.zip}`)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  out.sort((a, b) => b.whenMs - a.whenMs);
  return out;
}

export function pruneHistory(calls: LiveCall[], now = Date.now(), windowMs = 72 * 60 * 60 * 1000): LiveCall[] {
  const cut = now - windowMs;
  const seen = new Set<string>();
  const out: LiveCall[] = [];
  for (const c of calls) {
    if (c.whenMs < cut) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  out.sort((a, b) => b.whenMs - a.whenMs);
  return out;
}

export function mergeHistory(a: LiveCall[], b: LiveCall[]): LiveCall[] {
  return pruneHistory([...a, ...b]);
}

export function placeMatches(call: LiveCall, item: { zip: string; address?: string; street?: string }): boolean {
  if (item.address) {
    const a = item.address.toUpperCase();
    const street = (item.street || item.address.replace(/^\d+\s+/, "")).toUpperCase();
    return (
      call.address.toUpperCase().includes(a.slice(0, 18)) ||
      (street.length > 4 && call.street.toUpperCase().includes(street.slice(0, 18)))
    );
  }
  return !!item.zip && call.zip === item.zip;
}

/** Calls since yesterday 6pm local, unless the digest was already marked later. */
export function overnightCutoff(digestAt: number | null, now = Date.now()): number {
  const d = new Date(now);
  const sixAm = new Date(d);
  sixAm.setHours(6, 0, 0, 0);
  const yesterday6pm = sixAm.getTime() - 12 * 60 * 60 * 1000;
  if (digestAt && digestAt > yesterday6pm) return digestAt;
  return yesterday6pm;
}

export function digestCalls(
  calls: LiveCall[],
  watch: Array<{ zip: string; address?: string; street?: string }>,
  since: number,
): LiveCall[] {
  if (!watch.length) return [];
  return calls
    .filter((c) => c.whenMs >= since && watch.some((w) => placeMatches(c, w)))
    .sort((a, b) => b.whenMs - a.whenMs);
}

export function backoffMs(attempt: number, base = 400): number {
  return Math.min(8_000, base * 2 ** attempt);
}
