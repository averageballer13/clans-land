/* The world's storage.

   One dialect everywhere: Postgres. In production DATABASE_URL points at a
   hosted database, which is what lets the game run on a platform with no disk
   of its own. With no DATABASE_URL it falls back to PGlite — a real Postgres
   running inside this process against a local folder — so the same SQL is
   exercised in tests as in production, with nothing to install. */

let driver = null

/* Every hosted provider names the connection string differently, and the
   pooled one is what a serverless platform needs. Take whichever is set. */
export function databaseUrl() {
  const env = process.env
  return (
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL_NON_POOLING ||
    env.NEON_DATABASE_URL ||
    env.SUPABASE_DB_URL ||
    ''
  )
}

async function connect() {
  if (driver) return driver

  const url = databaseUrl()
  if (url) {
    const { default: pg } = await import('pg')
    // One connection per instance: a serverless platform runs many of them and
    // the hosted pooler is what multiplexes underneath.
    const pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX || 1),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    })
    driver = {
      query: (text, params) => pool.query(text, params),
      // pg happily runs a whole script in one go when there are no parameters.
      exec: (text) => pool.query(text),
      kind: 'pg',
    }
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const { mkdirSync, rmSync } = await import('node:fs')
    const dir = process.env.CLANS_DB_DIR || 'server/data/pg'
    mkdirSync(dir, { recursive: true })

    /* Killing the process mid-write leaves the local directory unopenable, and
       it fails with a WebAssembly trace rather than anything readable. This is
       the development convenience database, not the live world, so start a
       fresh one rather than leaving someone stuck. */
    let lite
    try {
      lite = new PGlite(dir)
      await lite.waitReady
    } catch (e) {
      console.warn(`[clans] local database at ${dir} could not be opened, starting a fresh one`)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      lite = new PGlite(dir)
      await lite.waitReady
    }

    driver = {
      query: (text, params) => lite.query(text, params ?? []),
      // The parameterised path speaks the extended protocol, which carries one
      // statement at a time; exec is the multi-statement one.
      exec: (text) => lite.exec(text),
      kind: 'pglite',
    }
  }
  return driver
}

export async function query(text, params) {
  const d = await connect()
  return d.query(text, params)
}

/* A whole script, several statements at a time. Never takes parameters. */
export async function exec(text) {
  const d = await connect()
  return d.exec(text)
}
export async function many(text, params) {
  return (await query(text, params)).rows
}
export async function one(text, params) {
  return (await query(text, params)).rows[0] ?? null
}
export async function run(text, params) {
  const res = await query(text, params)
  return res.rowCount ?? 0
}

/* Everything inside runs, or nothing does. */
export async function tx(fn) {
  await query('BEGIN')
  try {
    const out = await fn()
    await query('COMMIT')
    return out
  } catch (e) {
    await query('ROLLBACK')
    throw e
  }
}

export const now = () => Date.now()

export async function logEvent(kind, tag, text) {
  await run('INSERT INTO events (kind, tag, text, created_at) VALUES ($1, $2, $3, $4)', [kind, tag, text, now()])
}

/* ------------------------------------------------------------------
   Schema. Created on first use, safe to run again.
   ------------------------------------------------------------------ */
let ready = null
export function migrate() {
  if (!ready) ready = doMigrate()
  return ready
}

async function doMigrate() {
  await exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      address    TEXT PRIMARY KEY,
      handle     TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      seen_at    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nonces (
      nonce      TEXT PRIMARY KEY,
      address    TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      address    TEXT NOT NULL REFERENCES wallets(address),
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clans (
      id         TEXT PRIMARY KEY,
      tag        TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      entry      TEXT NOT NULL,
      region     TEXT NOT NULL,
      lang       TEXT NOT NULL,
      crest      TEXT NOT NULL,
      paint      TEXT NOT NULL,
      cap_lat    DOUBLE PRECISION NOT NULL,
      cap_lon    DOUBLE PRECISION NOT NULL,
      trophies   INTEGER NOT NULL DEFAULT 0,
      xp         INTEGER NOT NULL DEFAULT 0,
      wins       INTEGER NOT NULL DEFAULT 0,
      losses     INTEGER NOT NULL DEFAULT 0,
      coin_sym   TEXT,
      coin_addr  TEXT,
      coin_curve TEXT,
      coin_tx    TEXT,
      founded_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      address   TEXT PRIMARY KEY REFERENCES wallets(address),
      clan_id   TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      role      TEXT NOT NULL,
      joined_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS members_clan ON members(clan_id);

    CREATE TABLE IF NOT EXISTS requests (
      clan_id    TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      address    TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (clan_id, address)
    );

    CREATE TABLE IF NOT EXISTS tiles (
      id       INTEGER PRIMARY KEY,
      lat      DOUBLE PRECISION NOT NULL,
      lon      DOUBLE PRECISION NOT NULL,
      d_lat    DOUBLE PRECISION NOT NULL,
      d_lon    DOUBLE PRECISION NOT NULL,
      clan_id  TEXT REFERENCES clans(id) ON DELETE SET NULL,
      taken_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS tiles_clan ON tiles(clan_id);

    CREATE TABLE IF NOT EXISTS wars (
      id          TEXT PRIMARY KEY,
      a_id        TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      b_id        TEXT NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      score_a     DOUBLE PRECISION NOT NULL DEFAULT 0,
      score_b     DOUBLE PRECISION NOT NULL DEFAULT 0,
      wei_a       TEXT NOT NULL DEFAULT '0',
      wei_b       TEXT NOT NULL DEFAULT '0',
      stake       INTEGER NOT NULL,
      started_at  BIGINT NOT NULL,
      ends_at     BIGINT NOT NULL,
      start_block BIGINT,
      scan_block  BIGINT,
      settled_at  BIGINT,
      winner_id   TEXT
    );

    CREATE TABLE IF NOT EXISTS bounties (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      title      TEXT NOT NULL,
      reward     DOUBLE PRECISION NOT NULL,
      clan_id    TEXT,
      by_address TEXT NOT NULL,
      claimed_by TEXT,
      state      TEXT NOT NULL DEFAULT 'open',
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id         BIGSERIAL PRIMARY KEY,
      kind       TEXT NOT NULL,
      tag        TEXT,
      text       TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  /* Added after the first release. Postgres takes IF NOT EXISTS here, so this
     is safe to run against a world that is already live. */
  await exec(`
    ALTER TABLE clans   ADD COLUMN IF NOT EXISTS motto     TEXT;
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pnl_wei   TEXT NOT NULL DEFAULT '0';
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS trades    INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS spent_wei TEXT NOT NULL DEFAULT '0';
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS recv_wei  TEXT NOT NULL DEFAULT '0';
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hold_wei  TEXT NOT NULL DEFAULT '0';
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hold_at   BIGINT;

    CREATE TABLE IF NOT EXISTS positions (
      address   TEXT NOT NULL,
      token     TEXT NOT NULL,
      curve     TEXT NOT NULL,
      value_wei TEXT NOT NULL DEFAULT '0',
      seen_at   BIGINT NOT NULL,
      valued_at BIGINT,
      PRIMARY KEY (address, token)
    );
    CREATE INDEX IF NOT EXISTS positions_addr ON positions(address);
  `)

  await run("INSERT INTO meta (key, value) VALUES ('version', '1') ON CONFLICT (key) DO NOTHING")
  await ensureGrid()
}

export async function getMeta(key, fallback = null) {
  const row = await one('SELECT value FROM meta WHERE key = $1', [key])
  return row?.value ?? fallback
}

export async function setMeta(key, value) {
  await run(
    'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, String(value)]
  )
}

/* Every write bumps this. Clients poll it, so one tiny read tells a browser
   whether anything changed instead of shipping the whole world each time. */
export async function bumpVersion() {
  const row = await one(
    `INSERT INTO meta (key, value) VALUES ('version', '1')
     ON CONFLICT (key) DO UPDATE SET value = (meta.value::bigint + 1)::text
     RETURNING value`
  )
  return Number(row.value)
}

/* The tile grid is generated once and never regenerated: ids are stable, so
   land ownership survives every redeploy. Columns per row follow cos(lat) so
   tiles stay roughly equal-area, and the remainder is handed out
   largest-remainder-first, giving exactly `target` tiles rather than about
   that many. */
export async function ensureGrid(rows = 30, target = 1200) {
  const have = Number((await one('SELECT COUNT(*)::int AS n FROM tiles')).n)
  if (have > 0) return have

  const lats = Array.from({ length: rows }, (_, r) => 90 - (r + 0.5) * (180 / rows))
  const weights = lats.map((lat) => Math.max(0.08, Math.cos((lat * Math.PI) / 180)))
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (w / sum) * target)
  const cols = exact.map((n) => Math.max(3, Math.floor(n)))
  let short = target - cols.reduce((a, b) => a + b, 0)
  const order = exact.map((n, i) => ({ i, frac: n - Math.floor(n) })).sort((a, b) => b.frac - a.frac)
  for (let k = 0; short > 0; k++, short--) cols[order[k % rows].i]++

  const rowsToInsert = []
  let id = 0
  lats.forEach((lat, r) => {
    for (let col = 0; col < cols[r]; col++) {
      rowsToInsert.push([id++, lat, -180 + (col + 0.5) * (360 / cols[r]), 180 / rows, 360 / cols[r]])
    }
  })

  await tx(async () => {
    // Chunked: one statement carrying 6000 parameters is past what drivers take.
    for (let i = 0; i < rowsToInsert.length; i += 200) {
      const chunk = rowsToInsert.slice(i, i + 200)
      const values = chunk.map((_, n) => {
        const b = n * 5
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`
      })
      await run(`INSERT INTO tiles (id, lat, lon, d_lat, d_lon) VALUES ${values.join(',')}`, chunk.flat())
    }
  })

  return Number((await one('SELECT COUNT(*)::int AS n FROM tiles')).n)
}
