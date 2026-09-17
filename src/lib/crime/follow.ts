import type { LiveCall } from "./cad-parse";
import type { OffenseReport } from "./types";

export function callFingerprint(
  c: Pick<LiveCall, "problem" | "address" | "zip" | "units" | "tac" | "txdot" | "camera">,
): string {
  return [c.problem, c.address, c.zip, c.units ?? "", c.tac ?? "", c.txdot?.summary ?? "", c.camera?.name ?? ""].join("|");
}

export function reportFingerprint(r: OffenseReport): string {
  return [r.id, r.codeName, r.dateTime, r.zip, r.area, r.against].join("|");
}

export type FollowDiff = {
  id: string;
  kind: "update" | "cleared";
  title: string;
  body: string;
};

export function diffFollowedCalls(
  followed: Array<{ id: string; kind: string; fingerprint: string; title: string; subtitle: string; status: string }>,
  calls: LiveCall[],
): FollowDiff[] {
  const live = new Map(calls.map((c) => [c.id, c]));
  const out: FollowDiff[] = [];
  for (const f of followed) {
    if (f.kind !== "call" || f.status === "cleared") continue;
    const c = live.get(f.id);
    if (!c) {
      out.push({
        id: f.id,
        kind: "cleared",
        title: f.title,
        body: f.subtitle,
      });
      continue;
    }
    const next = callFingerprint(c);
    if (next !== f.fingerprint) {
      out.push({
        id: f.id,
        kind: "update",
        title: c.problem,
        body: [c.address, c.zip, c.txdot?.summary].filter(Boolean).join(" · "),
      });
    }
  }
  return out;
}
