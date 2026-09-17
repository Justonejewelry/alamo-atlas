import type { DailyFeed } from "./daily";
import type { OffenseReport } from "./types";

export function reportsCsv(
  reports: OffenseReport[],
  meta: { from: string; to: string; zip?: string; asOf?: string },
): void {
  const note = `# Alamo Atlas written offense reports — not calls for service, not arrests. ${meta.from} to ${meta.to}. Not 911.`;
  const header = "id,report_date,datetime,offense,against,group,zip,area";
  const rows = reports.map((r) =>
    [r.id, r.reportDate, r.dateTime, r.codeName, r.against, r.group, r.zip, r.area]
      .map((v) => csvCell(String(v ?? "")))
      .join(","),
  );
  downloadCsv(`alamo-atlas-${meta.zip || "bexar"}-${meta.to || "reports"}.csv`, `${note}\n${header}\n${rows.join("\n")}\n`);
}

export function dailyCsv(feed: DailyFeed, zip?: string): void {
  const calls = zip ? feed.calls.filter((c) => c.zip === zip) : feed.calls;
  const note = [
    `# Alamo Atlas daily dispatches — ${feed.label}.`,
    `# Every public SAPD/SAFD call for that calendar day (America/Chicago).`,
    `# as_called_in is the CAD problem title (how the call was dispatched). It is not a 911 audio transcript. SAPD does not publish 911 audio here.`,
    `# Locations are hundred-block or ZIP. Not a rooftop, unit, or name. CFS is not a confirmed crime. Not 911.`,
    `# Source: ${feed.source}. Fetched ${feed.fetchedAt}.`,
  ].join("\n");
  const header = "id,time,agency,as_called_in,problem,address,zip,area,category,severity";
  const rows = calls.map((c) =>
    [
      c.id,
      c.when,
      c.agency ?? "police",
      c.asCalledIn ?? c.problem,
      c.problem,
      c.address,
      c.zip,
      c.division,
      c.category ?? "",
      c.severity,
    ]
      .map((v) => csvCell(String(v ?? "")))
      .join(","),
  );
  const slug = zip || "bexar";
  downloadCsv(`alamo-atlas-daily-${feed.day}-${slug}.csv`, `${note}\n${header}\n${rows.join("\n")}\n`);
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
