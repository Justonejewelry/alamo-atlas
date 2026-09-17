import type { Feature, FeatureCollection, Geometry } from "geojson";
import { t } from "./i18n";
import type { LiveCall } from "./live";
import type { DailyFeed } from "./daily";
import { usePrefs } from "./prefs";
import { drawQr } from "./qr";
import type { OffenseReport, ZipProps } from "./types";

const PAGE_W = 612;
const PAGE_H = 792;
const SCALE = 2;
const CW = PAGE_W * SCALE;
const CH = PAGE_H * SCALE;

const INK = "#1a1c1e";
const MUTED = "#5c5f5b";
const RULE = "#d9d4cc";
const PAPER = "#f7f4ef";
const PANEL = "#efeae3";
const ACCENT = "#c612af";
const FIRE = "#e85d04";
const EMS = "#2a9d8f";

let logoImg: HTMLImageElement | null | undefined;
let zipGeoCache: FeatureCollection | null = null;

function locale() {
  return usePrefs.getState().locale;
}

function appUrl(zip?: string): string {
  const raw =
    (typeof import.meta !== "undefined" ? String(import.meta.env?.VITE_PUBLIC_HOSTNAME ?? "") : "") ||
    (typeof window !== "undefined" ? window.location.host : "");
  const host = raw.trim().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  const origin =
    host && host.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
      ? `https://${host}`
      : typeof window !== "undefined"
        ? window.location.origin
        : "https://justonejewelry.github.io/Chicas-Map/atlas";
  const u = new URL(origin);
  if (zip) {
    u.searchParams.set("zip", zip);
    u.searchParams.set("mode", "live");
  }
  return u.toString();
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoImg !== undefined) return logoImg;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/logo.jpg";
    await img.decode();
    logoImg = img;
    return img;
  } catch {
    logoImg = null;
    return null;
  }
}

async function loadZipGeo(): Promise<FeatureCollection | null> {
  if (zipGeoCache) return zipGeoCache;
  try {
    const res = await fetch("/geo/bexar-zips.json");
    if (!res.ok) return null;
    zipGeoCache = (await res.json()) as FeatureCollection;
    return zipGeoCache;
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillWrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 8,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  let used = 0;
  const flush = (s: string) => {
    ctx.fillText(s, x, yy);
    yy += lineHeight;
    used++;
  };
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      flush(line);
      if (used >= maxLines) return yy;
      line = w;
    } else line = next;
  }
  if (line && used < maxLines) flush(line);
  return yy;
}

function ringsOf(geom: Geometry): number[][][] {
  if (geom.type === "Polygon") return geom.coordinates as number[][][];
  if (geom.type === "MultiPolygon") return (geom.coordinates as number[][][][]).flat();
  return [];
}

function boundsOf(rings: number[][][]): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      const x = p[0] ?? 0;
      const y = p[1] ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function drawZipMap(
  ctx: CanvasRenderingContext2D,
  geo: FeatureCollection | null,
  zip: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 14);
  ctx.clip();
  ctx.fillStyle = "#ece7e0";
  ctx.fillRect(x, y, w, h);

  const features = (geo?.features ?? []) as Feature<Geometry, ZipProps>[];
  const selected = features.find((f) => String(f.properties?.ZIP) === zip);
  const selRings = selected ? ringsOf(selected.geometry) : [];
  const selB = boundsOf(selRings);
  const allRings = features.flatMap((f) => ringsOf(f.geometry));
  const allB = boundsOf(allRings);
  const box = selB ?? allB;
  if (!box) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 22px 'IBM Plex Sans', system-ui, sans-serif";
    ctx.fillText(zip || "Bexar County", x + 24, y + h / 2);
    ctx.restore();
    return;
  }
  const pad = 0.12;
  const bw = box[2] - box[0] || 0.01;
  const bh = box[3] - box[1] || 0.01;
  const minX = box[0] - bw * pad;
  const maxX = box[2] + bw * pad;
  const minY = box[1] - bh * pad;
  const maxY = box[3] + bh * pad;
  const sx = w / (maxX - minX);
  const sy = h / (maxY - minY);
  const s = Math.min(sx, sy);
  const ox = x + (w - (maxX - minX) * s) / 2;
  const oy = y + (h - (maxY - minY) * s) / 2;
  const proj = (lng: number, lat: number): [number, number] => [
    ox + (lng - minX) * s,
    oy + (maxY - lat) * s,
  ];

  const drawFeat = (f: Feature<Geometry, ZipProps>, fill: string, stroke: string, width: number) => {
    const rings = ringsOf(f.geometry);
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [px, py] = proj(p[0] ?? 0, p[1] ?? 0);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  for (const f of features) {
    if (String(f.properties?.ZIP) === zip) continue;
    const rb = boundsOf(ringsOf(f.geometry));
    if (!rb) continue;
    const overlaps = rb[0] < maxX && rb[2] > minX && rb[1] < maxY && rb[3] > minY;
    if (!overlaps) continue;
    drawFeat(f, "#f3eee8", "#cfc8bf", 1);
  }
  if (selected) drawFeat(selected, "rgba(198,18,175,0.28)", ACCENT, 3);

  ctx.fillStyle = INK;
  ctx.font = "700 28px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(zip || "Bexar", x + 20, y + 36);
  ctx.fillStyle = MUTED;
  ctx.font = "500 16px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText("ZIP · public map", x + 20, y + 58);
  ctx.restore();

  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
}

function agencyDot(agency: string | undefined): string {
  if (agency === "fire") return FIRE;
  if (agency === "ems") return EMS;
  return ACCENT;
}

function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, size, size);
  else {
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

async function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number): Promise<Blob> {
  return pagesToPdf([{ kind: "jpeg", bytes: jpeg, w: imgW, h: imgH }]);
}

type PdfPart =
  | { kind: "jpeg"; bytes: Uint8Array; w: number; h: number }
  | { kind: "lines"; lines: string[] };

function pdfEscape(s: string): string {
  const ascii = s.replace(/[^\x20-\x7E]/g, (ch) => {
    const map: Record<string, string> = {
      Á: "A",
      É: "E",
      Í: "I",
      Ó: "O",
      Ú: "U",
      á: "a",
      é: "e",
      í: "i",
      ó: "o",
      ú: "u",
      ñ: "n",
      Ñ: "N",
      ü: "u",
      "—": "-",
      "–": "-",
      "’": "'",
      "‘": "'",
      "“": '"',
      "”": '"',
      "·": "-",
    };
    return map[ch] ?? " ";
  });
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxChars)];
}

function linesToContent(lines: string[], pageNo: number, pageCount: number): string {
  const header = `Alamo Atlas  ·  yesterday's dispatches  ·  ${pageNo} / ${pageCount}`;
  const footer = "Not 911. As called in = public CAD problem title, not 911 audio. Hundred-block or ZIP only.";
  const ops: string[] = ["BT", "/F1 8 Tf", "0.12 0.11 0.12 rg"];
  let y = 756;
  ops.push(`/F1 8 Tf 36 ${y} Td (${pdfEscape(header)}) Tj`);
  y -= 16;
  ops.push("ET BT /F1 8 Tf 0.12 0.11 0.12 rg");
  let first = true;
  for (const raw of lines) {
    for (const line of wrapPdfLine(raw, 108)) {
      if (y < 48) break;
      if (first) {
        ops.push(`36 ${y} Td (${pdfEscape(line)}) Tj`);
        first = false;
      } else {
        ops.push(`0 -11 Td (${pdfEscape(line)}) Tj`);
      }
      y -= 11;
    }
  }
  ops.push("ET BT /F1 7 Tf 0.36 0.37 0.36 rg");
  ops.push(`36 28 Td (${pdfEscape(footer)}) Tj`);
  ops.push("ET");
  return ops.join("\n");
}

async function pagesToPdf(parts: PdfPart[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let cursor = 0;
  const push = (s: string | Uint8Array) => {
    const b = typeof s === "string" ? encoder.encode(s) : s;
    chunks.push(b);
    cursor += b.length;
  };
  const obj = (id: number, body: string | Uint8Array | (string | Uint8Array)[]) => {
    offsets[id] = cursor;
    push(`${id} 0 obj\n`);
    if (typeof body === "string" || body instanceof Uint8Array) push(body);
    else for (const p of body) push(p);
    push("\nendobj\n");
  };

  const pageIds: number[] = [];
  let nextId = 3;
  const kidsPlaceholder = 2;

  type BuiltPage = { id: number; contentId: number; content: string; image?: { id: number; bytes: Uint8Array; w: number; h: number } };
  const built: BuiltPage[] = [];
  const linePages = parts.filter((p) => p.kind === "lines");
  const lineCount = linePages.length;
  let lineNo = 0;
  for (const part of parts) {
    if (part.kind === "jpeg") {
      const imageId = nextId++;
      const contentId = nextId++;
      const pageId = nextId++;
      const content = `q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im${imageId} Do\nQ\n`;
      built.push({ id: pageId, contentId, content, image: { id: imageId, bytes: part.bytes, w: part.w, h: part.h } });
      pageIds.push(pageId);
    } else {
      lineNo += 1;
      const contentId = nextId++;
      const pageId = nextId++;
      built.push({
        id: pageId,
        contentId,
        content: linesToContent(part.lines, lineNo, Math.max(1, lineCount)),
      });
      pageIds.push(pageId);
    }
  }

  const fontId = nextId++;
  const maxId = nextId - 1;

  push("%PDF-1.4\n%\x80\x80\x80\x80\n");
  obj(1, `<< /Type /Catalog /Pages ${kidsPlaceholder} 0 R >>`);
  obj(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  obj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const page of built) {
    if (page.image) {
      obj(page.image.id, [
        `<< /Type /XObject /Subtype /Image /Width ${page.image.w} /Height ${page.image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.image.bytes.byteLength} >>\nstream\n`,
        page.image.bytes,
        "\nendstream",
      ]);
    }
    obj(page.contentId, `<< /Length ${page.content.length} >>\nstream\n${page.content}endstream`);
    const xobj = page.image ? `/XObject << /Im${page.image.id} ${page.image.id} 0 R >>` : "";
    obj(
      page.id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${page.contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> ${xobj} >> >>`,
    );
  }

  const xrefAt = cursor;
  push(`xref\n0 ${maxId + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxId; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  const total = chunks.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of chunks) {
    out.set(p, o);
    o += p.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("jpeg"))), "image/jpeg", 0.88);
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

type SheetKind = "neighborhood" | "report" | "daily";

type SheetInput = {
  kind: SheetKind;
  zip: string;
  name: string;
  range: string;
  reports: number;
  cfs: number;
  spike: string;
  live: LiveCall[];
  offenses: OffenseReport[];
  report?: OffenseReport;
  zipGeo?: FeatureCollection | null;
  topProblems?: { name: string; n: number }[];
};

async function renderSheet(input: SheetInput): Promise<HTMLCanvasElement> {
  const loc = locale();
  const tt = (key: string, vars?: Record<string, string | number>) => t(loc, key, vars);
  await document.fonts?.ready.catch(() => undefined);
  const [logo, geo] = await Promise.all([loadLogo(), input.zipGeo ? Promise.resolve(input.zipGeo) : loadZipGeo()]);
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CW, CH);

  const m = 64;
  drawLogo(ctx, logo, m, 48, 84);
  ctx.fillStyle = ACCENT;
  ctx.font = "600 18px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.letterSpacing = "0.16em";
  ctx.fillText(tt("brand.kicker").toUpperCase(), m + 104, 78);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = INK;
  ctx.font = "italic 52px 'Instrument Serif', 'Times New Roman', serif";
  ctx.fillText("Alamo Atlas", m + 104, 128);
  ctx.fillStyle = MUTED;
  ctx.font = "500 20px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(input.kind === "daily" ? tt("pdf.dailyKicker") : tt("pdf.kicker"), m + 104, 156);

  const now = new Date().toLocaleString(loc === "es" ? "es-US" : "en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "500 16px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(now, CW - m, 86);
  ctx.fillStyle = INK;
  ctx.font = "700 22px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(input.range, CW - m, 116);
  ctx.textAlign = "left";

  ctx.fillStyle = ACCENT;
  ctx.fillRect(m, 176, CW - m * 2, 4);

  const mapW = 680;
  const mapH = 400;
  const mapY = 204;
  drawZipMap(ctx, geo, input.zip, m, mapY, mapW, mapH);

  const sx = m + mapW + 28;
  const sw = CW - m - sx;
  roundRect(ctx, sx, mapY, sw, mapH, 14);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = "700 44px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(input.zip || "Bexar", sx + 22, mapY + 52);
  ctx.fillStyle = MUTED;
  ctx.font = "500 18px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.fillText(input.name || "San Antonio", sx + 22, mapY + 78);

  const stats: [string, string][] =
    input.kind === "report" && input.report
      ? [
          [tt("reports.id"), input.report.id],
          [tt("reports.offense"), input.report.codeName],
          [tt("reports.date"), input.report.reportDate],
          [tt("reports.against"), input.report.against],
          [tt("reports.area"), input.report.area || "—"],
        ]
      : input.kind === "daily"
        ? [
            [tt("daily.total"), String(input.cfs.toLocaleString("en-US"))],
            [
              tt("live.title"),
              tt("agency.counts", {
                police: input.live.filter((c) => (c.agency ?? "police") === "police").length,
                fire: input.live.filter((c) => c.agency === "fire").length,
                ems: input.live.filter((c) => c.agency === "ems").length,
              }),
            ],
            [tt("daily.scope"), input.zip || tt("daily.citywide")],
            [tt("daily.calledIn"), tt("daily.calledInShort")],
          ]
        : [
            [tt("stats.reports"), String(input.reports.toLocaleString("en-US"))],
            [tt("stats.cfs"), String(input.cfs.toLocaleString("en-US"))],
            [tt("stats.vsPrior"), input.spike],
            [
              tt("live.title"),
              tt("agency.counts", {
                police: input.live.filter((c) => (c.agency ?? "police") === "police").length,
                fire: input.live.filter((c) => c.agency === "fire").length,
                ems: input.live.filter((c) => c.agency === "ems").length,
              }),
            ],
          ];
  let sy = mapY + 110;
  for (const [label, value] of stats) {
    ctx.fillStyle = MUTED;
    ctx.font = "600 12px 'IBM Plex Sans', system-ui, sans-serif";
    ctx.letterSpacing = "0.12em";
    ctx.fillText(label.toUpperCase(), sx + 22, sy);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = INK;
    ctx.font = "600 18px 'IBM Plex Sans', system-ui, sans-serif";
    const clipped = value.length > 28 ? `${value.slice(0, 27)}…` : value;
    ctx.fillText(clipped, sx + 22, sy + 22);
    sy += 48;
  }

  const qrSize = 132;
  const qrX = sx + sw - qrSize - 18;
  const qrY = mapY + mapH - qrSize - 36;
  roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 28, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  drawQr(ctx, appUrl(input.zip), qrX, qrY, qrSize, INK, "#ffffff");
  ctx.fillStyle = MUTED;
  ctx.font = "600 11px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(tt("pdf.scan"), qrX + qrSize / 2, qrY + qrSize + 14);
  ctx.textAlign = "left";

  let y = mapY + mapH + 40;
  const col = (title: string, rows: string[], dots?: string[]) => {
    ctx.fillStyle = ACCENT;
    ctx.font = "600 13px 'IBM Plex Sans', system-ui, sans-serif";
    ctx.letterSpacing = "0.14em";
    ctx.fillText(title.toUpperCase(), m, y);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = RULE;
    ctx.fillRect(m, y + 8, CW - m * 2, 1);
    y += 32;
    if (!rows.length) {
      ctx.fillStyle = MUTED;
      ctx.font = "500 16px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillText(tt("pdf.empty"), m, y);
      y += 28;
      return;
    }
    ctx.font = "500 15px 'IBM Plex Sans', system-ui, sans-serif";
    for (let i = 0; i < rows.length; i++) {
      if (dots?.[i]) {
        ctx.fillStyle = dots[i]!;
        ctx.beginPath();
        ctx.arc(m + 6, y - 5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = INK;
      const text = rows[i] ?? "";
      let shown = text;
      while (ctx.measureText(shown).width > CW - m * 2 - 24 && shown.length > 8) shown = `${shown.slice(0, -2)}…`;
      ctx.fillText(shown, m + (dots ? 20 : 0), y);
      y += 24;
    }
    y += 12;
  };

  if (input.kind === "daily") {
    col(
      tt("pdf.dailyProblems"),
      (input.topProblems ?? []).slice(0, 10).map((p) => `${p.n.toLocaleString("en-US")}  ${p.name}`),
    );
    col(tt("pdf.dailyLogHint"), [tt("pdf.dailyLogHintBody", { n: input.cfs })]);
  } else if (input.kind === "neighborhood") {
    col(
      tt("pdf.liveHeading"),
      input.live.slice(0, 8).map((c) => {
        const ag = (c.agency ?? "police").toUpperCase().padEnd(5);
        return `${ag}  ${c.problem}  ·  ${c.address} ${c.zip}  (${c.when})`;
      }),
      input.live.slice(0, 8).map((c) => agencyDot(c.agency)),
    );
    col(
      tt("pdf.reportsHeading"),
      input.offenses.slice(0, 8).map((r) => `${r.reportDate}  ${r.codeName}  ·  ${r.zip}  ${r.area}  ${r.id}`),
    );
  } else if (input.report) {
    const r = input.report;
    col(tt("pdf.reportHeading"), [
      `${tt("reports.id")}: ${r.id}`,
      `${tt("reports.offense")}: ${r.codeName}`,
      `${tt("reports.group")}: ${r.group}`,
      `${tt("reports.datetime")}: ${r.dateTime || "—"}`,
      `${tt("reports.zip")}: ${r.zip}`,
      `${tt("reports.area")}: ${r.area || "—"}`,
      tt("reports.privacy"),
    ]);
  }

  y = Math.max(y, CH - 210);
  roundRect(ctx, m, y, CW - m * 2, CH - m - y, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(m, y, 6, CH - m - y);
  ctx.fillStyle = INK;
  ctx.font = "700 14px 'IBM Plex Sans', system-ui, sans-serif";
  ctx.letterSpacing = "0.14em";
  ctx.fillText(tt("pdf.legalTitle").toUpperCase(), m + 24, y + 28);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = MUTED;
  ctx.font = "500 15px 'IBM Plex Sans', system-ui, sans-serif";
  fillWrap(
    ctx,
    input.kind === "daily" ? tt("pdf.dailyDisclaimer") : tt("pdf.disclaimer"),
    m + 24,
    y + 52,
    CW - m * 2 - 48,
    20,
    6,
  );

  return canvas;
}

async function exportSheet(filename: string, input: SheetInput) {
  const canvas = await renderSheet(input);
  const jpeg = await canvasJpeg(canvas);
  const blob = await jpegToPdf(jpeg.bytes, jpeg.w, jpeg.h);
  downloadBlob(filename, blob);
}

export async function neighborhoodPdf(input: {
  zip: string;
  name: string;
  range: string;
  reports: number;
  cfs: number;
  spike: string;
  live: LiveCall[];
  offenses: OffenseReport[];
  zipGeo?: FeatureCollection | null;
}) {
  await exportSheet(`alamo-atlas-${input.zip || "bexar"}.pdf`, { kind: "neighborhood", ...input });
}

export async function reportPdf(r: OffenseReport, zipGeo?: FeatureCollection | null) {
  await exportSheet(`alamo-atlas-report-${r.id}.pdf`, {
    kind: "report",
    zip: r.zip,
    name: "",
    range: r.reportDate,
    reports: 0,
    cfs: 0,
    spike: "",
    live: [],
    offenses: [],
    report: r,
    zipGeo,
  });
}

const LOG_LINES = 62;

export async function dailyDispatchPdf(input: {
  feed: DailyFeed;
  zip?: string;
  name?: string;
  zipGeo?: FeatureCollection | null;
}) {
  const calls = input.zip ? input.feed.calls.filter((c) => c.zip === input.zip) : input.feed.calls;
  const canvas = await renderSheet({
    kind: "daily",
    zip: input.zip ?? "",
    name: input.name ?? "San Antonio",
    range: input.feed.label,
    reports: 0,
    cfs: calls.length,
    spike: "",
    live: calls,
    offenses: [],
    zipGeo: input.zipGeo,
    topProblems: tallyProblems(calls),
  });
  const cover = await canvasJpeg(canvas);
  const parts: PdfPart[] = [{ kind: "jpeg", bytes: cover.bytes, w: cover.w, h: cover.h }];
  const lines = calls.map((c) => {
    const ag = (c.agency ?? "police").toUpperCase().padEnd(6);
    const called = c.asCalledIn ?? c.problem;
    return `${c.when}  ${ag}  ${called}  ·  ${c.address}  ${c.zip}  ${c.division}  ${c.id}`;
  });
  for (let i = 0; i < lines.length; i += LOG_LINES) {
    parts.push({ kind: "lines", lines: lines.slice(i, i + LOG_LINES) });
  }
  if (lines.length === 0) {
    parts.push({ kind: "lines", lines: ["No public dispatches for this day."] });
  }
  const blob = await pagesToPdf(parts);
  downloadBlob(`alamo-atlas-daily-${input.feed.day}-${input.zip || "bexar"}.pdf`, blob);
}

function tallyProblems(calls: LiveCall[]): { name: string; n: number }[] {
  const map = new Map<string, number>();
  for (const c of calls) map.set(c.problem, (map.get(c.problem) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
}
