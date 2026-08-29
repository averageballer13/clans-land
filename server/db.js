import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const FILE = process.env.CLANS_DB || resolve('server/data/clans.db')
mkdirSync(dirname(FILE), { recursive: true })

export const db = new DatabaseSync(FILE)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS wallets (
  address    TEXT PRIMARY KEY,          -- checksummed
  handle     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (address) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS clans (
  id         TEXT PRIMARY KEY,          -- lowercased tag
  tag        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  entry      TEXT NOT NULL,             -- open | request | invite
  region     TEXT NOT NULL,
  lang       TEXT NOT NULL,
  crest      TEXT NOT NULL,             -- json
  paint      TEXT NOT NULL,
  cap_lat    REAL NOT NULL,
  cap_lon    REAL NOT NULL,
  trophies   INTEGER NOT NULL DEFAULT 0,
  xp         INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  coin_sym   TEXT,
  coin_addr  TEXT,
  founded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  address    TEXT PRIMARY KEY,          -- one clan per wallet
  clan_id    TEXT NOT NULL,
  role       TEXT NOT NULL,             -- leader | coleader | elder | member
  joined_at  INTEGER NOT NULL,
  FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE,
  FOREIGN KEY (address) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS requests (
  clan_id    TEXT NOT NULL,
  address    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (clan_id, address),
  FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE
);

-- The shared map. Every row is one of the world's tiles; clan_id is the
-- single source of truth for who holds it.
CREATE TABLE IF NOT EXISTS tiles (
  id       INTEGER PRIMARY KEY,
  lat      REAL NOT NULL,
  lon      REAL NOT NULL,
  d_lat    REAL NOT NULL,
  d_lon    REAL NOT NULL,
  clan_id  TEXT,
  taken_at INTEGER,
  FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS tiles_clan ON tiles(clan_id);

CREATE TABLE IF NOT EXISTS wars (
  id          TEXT PRIMARY KEY,
  a_id        TEXT NOT NULL,
  b_id        TEXT NOT NULL,
  score_a     REAL NOT NULL DEFAULT 0,
  score_b     REAL NOT NULL DEFAULT 0,
  stake       INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  ends_at     INTEGER NOT NULL,
  settled_at  INTEGER,
  winner_id   TEXT,
  FOREIGN KEY (a_id) REFERENCES clans(id) ON DELETE CASCADE,
  FOREIGN KEY (b_id) REFERENCES clans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bounties (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  reward      REAL NOT NULL,
  clan_id     TEXT,
  by_address  TEXT NOT NULL,
  claimed_by  TEXT,
  state       TEXT NOT NULL DEFAULT 'open',   -- open | claimed | done
  created_at  INTEGER NOT NULL
);

-- Append-only feed. Everyone reads the same history.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  tag        TEXT,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`)

/* Columns added after the first release. SQLite has no
   ADD COLUMN IF NOT EXISTS, so check first. */
function addColumn(table, name, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (cols.some((c) => c.name === name)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`)
}

addColumn('clans', 'coin_curve', 'TEXT')
addColumn('clans', 'coin_tx', 'TEXT')
addColumn('wars', 'start_block', 'INTEGER')
addColumn('wars', 'scan_block', 'INTEGER')
addColumn('wars', 'wei_a', "TEXT NOT NULL DEFAULT '0'")
addColumn('wars', 'wei_b', "TEXT NOT NULL DEFAULT '0'")

/* Entry used to be open / request / invite. Two options are enough and
   nobody could get into an invite-only clan anyway, so they collapse to
   public and private. */
db.exec("UPDATE clans SET entry = 'public' WHERE entry = 'open'")
db.exec("UPDATE clans SET entry = 'private' WHERE entry IN ('request', 'invite')")

export const now = () => Date.now()

export function logEvent(kind, tag, text) {
  db.prepare('INSERT INTO events (kind, tag, text, created_at) VALUES (?, ?, ?, ?)')
    .run(kind, tag, text, now())
}

/* The tile grid is generated once, on first boot, and never regenerated —
   tile ids are stable so land ownership survives restarts. */
export function ensureGrid(rows = 30, target = 1200) {
  const have = db.prepare('SELECT COUNT(*) AS n FROM tiles').get().n
  if (have > 0) return have

  // Columns per row follow cos(lat) so tiles stay roughly equal-area, and
  // the leftovers are handed out largest-remainder-first so the world holds
  // exactly `target` tiles rather than "about" that many.
  const lats = Array.from({ length: rows }, (_, r) => 90 - (r + 0.5) * (180 / rows))
  const weights = lats.map((lat) => Math.max(0.08, Math.cos((lat * Math.PI) / 180)))
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (w / sum) * target)
  const cols = exact.map((n) => Math.max(3, Math.floor(n)))
  let short = target - cols.reduce((a, b) => a + b, 0)
  const order = exact
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; short > 0; k++, short--) cols[order[k % rows].i]++

  const insert = db.prepare('INSERT INTO tiles (lat, lon, d_lat, d_lon) VALUES (?, ?, ?, ?)')
  db.exec('BEGIN')
  try {
    lats.forEach((lat, r) => {
      for (let col = 0; col < cols[r]; col++) {
        insert.run(lat, -180 + (col + 0.5) * (360 / cols[r]), 180 / rows, 360 / cols[r])
      }
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return db.prepare('SELECT COUNT(*) AS n FROM tiles').get().n
}
