/** Byte-mode QR, ECC M, versions 1–10. Returns a 0/1 module matrix. */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

type Group = [blocks: number, data: number, ec: number];

const VERSIONS: { size: number; groups: Group[] }[] = [
  { size: 0, groups: [] },
  { size: 21, groups: [[1, 16, 10]] },
  { size: 25, groups: [[1, 28, 16]] },
  { size: 29, groups: [[1, 44, 26]] },
  { size: 33, groups: [[2, 32, 18]] },
  { size: 37, groups: [[2, 43, 24]] },
  { size: 41, groups: [[4, 27, 16]] },
  { size: 45, groups: [[4, 31, 18]] },
  { size: 49, groups: [[2, 38, 22], [2, 39, 22]] },
  { size: 53, groups: [[3, 36, 22], [2, 37, 22]] },
  { size: 57, groups: [[4, 43, 26], [1, 44, 26]] },
];

const ALIGN: number[][] = [
  [],
  [],
  [18],
  [22],
  [26],
  [30],
  [34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const REMAINDER = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

function dataCapacity(v: number): number {
  const spec = VERSIONS[v]!;
  let n = 0;
  for (const g of spec.groups) n += g[0] * g[1];
  return n;
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j]!, EXP[i]!);
      next[j + 1] ^= poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ec: number): number[] {
  const gen = rsGenerator(ec);
  const buf = data.concat(new Array(ec).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i]!;
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j]! ^= gfMul(gen[j]!, coef);
  }
  return buf.slice(data.length);
}

function bitsToBytes(bits: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ?? 0);
    out.push(b);
  }
  return out;
}

function encodeData(bytes: number[], version: number): number[] {
  const cap = dataCapacity(version);
  const countBits = version >= 10 ? 16 : 8;
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  const maxBits = cap * 8;
  const term = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const pad = [0b11101100, 0b00010001];
  let pi = 0;
  while (bits.length < maxBits) {
    push(pad[pi % 2]!, 8);
    pi++;
  }
  return bitsToBytes(bits.slice(0, maxBits));
}

function interleave(version: number, data: number[]): number[] {
  const spec = VERSIONS[version]!;
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (const [n, dc, ec] of spec.groups) {
    for (let i = 0; i < n; i++) {
      const slice = data.slice(offset, offset + dc);
      offset += dc;
      blocks.push({ data: slice, ec: rsEncode(slice, ec) });
    }
  }
  const out: number[] = [];
  const maxD = Math.max(...blocks.map((b) => b.data.length));
  const maxE = Math.max(...blocks.map((b) => b.ec.length));
  for (let i = 0; i < maxD; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]!);
  }
  for (let i = 0; i < maxE; i++) {
    for (const b of blocks) if (i < b.ec.length) out.push(b.ec[i]!);
  }
  return out;
}

function setFinder(m: number[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (yy < 0 || xx < 0 || yy >= m.length || xx >= m.length) continue;
      const on =
        dx === -1 ||
        dy === -1 ||
        dx === 7 ||
        dy === 7 ||
        (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6)) ||
        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      const inSep = dx === -1 || dy === -1 || dx === 7 || dy === 7;
      m[yy]![xx] = inSep ? 0 : on ? 1 : 0;
      reserved[yy]![xx] = true;
    }
  }
}

function setAlign(m: number[][], reserved: boolean[][], cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = cx + dx;
      const yy = cy + dy;
      if (reserved[yy]?.[xx]) return;
    }
  }
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = cx + dx;
      const yy = cy + dy;
      const on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      m[yy]![xx] = on ? 1 : 0;
      reserved[yy]![xx] = true;
    }
  }
}

function placeFunctions(m: number[][], reserved: boolean[][], version: number) {
  const n = m.length;
  setFinder(m, reserved, 0, 0);
  setFinder(m, reserved, n - 7, 0);
  setFinder(m, reserved, 0, n - 7);
  for (let i = 8; i < n - 8; i++) {
    const bit = i % 2 === 0 ? 1 : 0;
    if (!reserved[6]![i]) {
      m[6]![i] = bit;
      reserved[6]![i] = true;
    }
    if (!reserved[i]![6]) {
      m[i]![6] = bit;
      reserved[i]![6] = true;
    }
  }
  for (const y of ALIGN[version] ?? []) {
    for (const x of ALIGN[version] ?? []) setAlign(m, reserved, x, y);
  }
  reserved[n - 8]![8] = true;
  m[n - 8]![8] = 1;
  for (let i = 0; i < 9; i++) {
    if (i < n) {
      reserved[8]![i] = true;
      reserved[i]![8] = true;
    }
    if (n - 1 - i >= 0) {
      reserved[8]![n - 1 - i] = true;
      reserved[n - 1 - i]![8] = true;
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i]![n - 11 + j] = true;
        reserved[n - 11 + j]![i] = true;
      }
    }
  }
}

function maskBit(id: number, x: number, y: number): boolean {
  switch (id) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function placeData(m: number[][], reserved: boolean[][], codewords: number[], remainder: number) {
  const n = m.length;
  const bits: number[] = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  }
  for (let i = 0; i < remainder; i++) bits.push(0);
  let bi = 0;
  let dir = -1;
  let y = n - 1;
  for (let x = n - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (;;) {
      for (let dx = 0; dx < 2; dx++) {
        const xx = x - dx;
        if (!reserved[y]![xx]) {
          m[y]![xx] = bits[bi] ?? 0;
          bi++;
        }
      }
      y += dir;
      if (y < 0 || y >= n) {
        y -= dir;
        dir = -dir;
        break;
      }
    }
  }
}

function applyMask(m: number[][], reserved: boolean[][], id: number) {
  const n = m.length;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!reserved[y]![x] && maskBit(id, x, y)) m[y]![x] ^= 1;
    }
  }
}

function bchFormat(mask: number): number {
  const data = (0b00 << 3) | mask;
  let d = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((d >>> i) & 1) d ^= gen << (i - 10);
  }
  return (data << 10 | d) ^ 0x5412;
}

function bchVersion(v: number): number {
  let d = v << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((d >>> i) & 1) d ^= gen << (i - 12);
  }
  return (v << 12) | d;
}

function drawFormat(m: number[][], mask: number) {
  const n = m.length;
  const bits = bchFormat(mask);
  const pos = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    m[pos[i]![1]!]![pos[i]![0]!] = bit;
    if (i < 8) m[8]![n - 1 - i] = bit;
    else m[n - 15 + i]![8] = bit;
  }
}

function drawVersion(m: number[][], version: number) {
  if (version < 7) return;
  const n = m.length;
  const bits = bchVersion(version);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >> i) & 1;
    const a = Math.floor(i / 3);
    const b = i % 3;
    m[a]![n - 11 + b] = bit;
    m[n - 11 + b]![a] = bit;
  }
}

function scoreMask(m: number[][]): number {
  const n = m.length;
  let score = 0;
  const run = (get: (i: number) => number) => {
    let len = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) len++;
      else {
        if (len >= 5) score += len - 2;
        len = 1;
      }
    }
  };
  for (let y = 0; y < n; y++) run((x) => m[y]![x]!);
  for (let x = 0; x < n; x++) run((y) => m[y]![x]!);
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = m[y]![x];
      if (v === m[y]![x + 1] && v === m[y + 1]![x] && v === m[y + 1]![x + 1]) score += 3;
    }
  }
  const finder = (row: number[]) => {
    const s = row.join("");
    const pats = ["00001011101", "10111010000"];
    for (const p of pats) {
      let i = 0;
      while ((i = s.indexOf(p, i)) !== -1) {
        score += 40;
        i++;
      }
    }
  };
  for (let y = 0; y < n; y++) finder(m[y]!);
  for (let x = 0; x < n; x++) finder(m.map((row) => row[x]!));
  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  score += Math.abs(Math.floor((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v >= 10 ? 16 : 8;
    const need = Math.ceil((4 + countBits + byteLen * 8 + 4) / 8);
    if (need <= dataCapacity(v)) return v;
  }
  throw new Error("QR payload is too long");
}

export function qrMatrix(text: string): number[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const version = pickVersion(bytes.length);
  const n = VERSIONS[version]!.size;
  const codewords = interleave(version, encodeData(bytes, version));
  let best: number[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const reserved = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
    placeFunctions(m, reserved, version);
    placeData(m, reserved, codewords, REMAINDER[version]!);
    applyMask(m, reserved, mask);
    drawFormat(m, mask);
    drawVersion(m, version);
    const s = scoreMask(m);
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best!;
}

export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  dark = "#1a1c1e",
  light = "#ffffff",
) {
  const m = qrMatrix(text);
  const n = m.length;
  const quiet = 2;
  const modules = n + quiet * 2;
  const cell = size / modules;
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!m[row]![col]) continue;
      ctx.fillRect(x + (col + quiet) * cell, y + (row + quiet) * cell, cell + 0.4, cell + 0.4);
    }
  }
}
