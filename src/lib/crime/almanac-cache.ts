async function getSqlLazy() {
  const { getSql } = await import("../db");
  return getSql();
}

type MemHit = { exp: number; value: unknown };

const memory = new Map<string, MemHit>();

export type AlmanacCacheOpts<T> = {
  key: string;
  ttlMs: number;
  source: string;
  load: () => Promise<T>;
  validate?: (value: unknown) => value is T;
};

function stillValid(exp: number): boolean {
  return exp > Date.now();
}

function readMemory<T>(key: string, validate?: (value: unknown) => value is T): T | undefined {
  const hit = memory.get(key);
  if (!hit || !stillValid(hit.exp)) {
    if (hit) memory.delete(key);
    return undefined;
  }
  if (validate && !validate(hit.value)) {
    memory.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function writeMemory<T>(key: string, value: T, ttlMs: number): void {
  memory.set(key, { exp: Date.now() + ttlMs, value });
}

export function peekAlmanacMemory(key: string): unknown | undefined {
  return readMemory(key);
}

export function clearAlmanacMemory(): void {
  memory.clear();
}

function durableEnabled(): boolean {
  return typeof process === "undefined" || !process.env.NODE_TEST_CONTEXT;
}

async function readDurable<T>(key: string, validate?: (value: unknown) => value is T): Promise<T | undefined> {
  if (!durableEnabled()) return undefined;
  try {
    const sql = await getSqlLazy();
    const rows = await sql.query<{ payload: unknown; expires_at: string }>(
      "select payload, expires_at from almanac_cache where cache_key = $1 and expires_at > now() limit 1",
      [key],
    );
    const row = rows[0];
    if (!row) return undefined;
    const payload = row.payload;
    if (validate && !validate(payload)) return undefined;
    const exp = Date.parse(row.expires_at);
    writeMemory(key, payload, Number.isFinite(exp) ? Math.max(0, exp - Date.now()) : 60_000);
    return payload as T;
  } catch {
    return undefined;
  }
}

async function writeDurable(key: string, payload: unknown, source: string, ttlMs: number): Promise<void> {
  if (!durableEnabled()) return;
  try {
    const sql = await getSqlLazy();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    await sql.query(
      `insert into almanac_cache (cache_key, payload, source, fetched_at, expires_at)
       values ($1, $2::jsonb, $3, now(), $4::timestamptz)
       on conflict (cache_key) do update set
         payload = excluded.payload,
         source = excluded.source,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
      [key, JSON.stringify(payload), source, expires],
    );
  } catch {
    /* preview without the table, or a pooled blip — memory still holds */
  }
}

/**
 * Process TTL, then Neon/PGLite row, then loader.
 * Missing DATABASE_URL (PGLite preview) still works after migrations/*.sql apply.
 */
export async function cachedAlmanac<T>(opts: AlmanacCacheOpts<T>): Promise<T> {
  const mem = readMemory<T>(opts.key, opts.validate);
  if (mem !== undefined) return mem;

  const durable = await readDurable<T>(opts.key, opts.validate);
  if (durable !== undefined) return durable;

  const value = await opts.load();
  if (opts.validate && !opts.validate(value)) return value;
  writeMemory(opts.key, value, opts.ttlMs);
  void writeDurable(opts.key, value, opts.source, opts.ttlMs);
  return value;
}
