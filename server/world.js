import { randomUUID } from 'node:crypto'
import { db, now, logEvent } from './db.js'

export const CLAN_MAX = 50
export const BANNER_TILES = 6
export const TILES_PER_MEMBER = 3
export const WAR_LAND_SHARE = 5 // loser gives up a fifth

export const PAINTS = [
  '#ff6a00', '#ffc043', '#e8453c', '#3fb6a8', '#4a90d9', '#a06bff',
  '#8fd14f', '#ff5c8a', '#2ec27e', '#d98b2b', '#ff8ae2', '#5ec8ff',
]

export const landFor = (members) => BANNER_TILES + members * TILES_PER_MEMBER

const DEG = Math.PI / 180
export function greatCircle(la1, lo1, la2, lo2) {
  const p1 = la1 * DEG, p2 = la2 * DEG, dl = (lo2 - lo1) * DEG
  return Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))
}

/* ------------------------------------------------------------------
   Land. All allocation runs inside one transaction against the tiles
   table, so two clans founded at the same instant can never be handed
   the same ground.
   ------------------------------------------------------------------ */
export function grantTiles(clanId, count, fromLat, fromLon) {
  if (count <= 0) return 0
  const free = db.prepare('SELECT id, lat, lon FROM tiles WHERE clan_id IS NULL').all()
  if (!free.length) return 0
  free.sort(
    (a, b) => greatCircle(fromLat, fromLon, a.lat, a.lon) - greatCircle(fromLat, fromLon, b.lat, b.lon)
  )
  const take = free.slice(0, count)
  const upd = db.prepare('UPDATE tiles SET clan_id = ?, taken_at = ? WHERE id = ? AND clan_id IS NULL')
  let n = 0
  for (const t of take) n += upd.run(clanId, now(), t.id).changes
  return n
}

export function releaseTiles(clanId, count, towardLat, towardLon) {
  const held = db.prepare('SELECT id, lat, lon FROM tiles WHERE clan_id = ?').all(clanId)
  if (!held.length) return 0
  // Give up the ground furthest from the enemy capital first.
  held.sort(
    (a, b) => greatCircle(towardLat, towardLon, b.lat, b.lon) - greatCircle(towardLat, towardLon, a.lat, a.lon)
  )
  const upd = db.prepare('UPDATE tiles SET clan_id = NULL, taken_at = NULL WHERE id = ?')
  let n = 0
  for (const t of held.slice(0, count)) n += upd.run(t.id).changes
  return n
}

export function transferTiles(fromClan, toClan, count, towardLat, towardLon) {
  const held = db.prepare('SELECT id, lat, lon FROM tiles WHERE clan_id = ?').all(fromClan)
  held.sort(
    (a, b) => greatCircle(towardLat, towardLon, a.lat, a.lon) - greatCircle(towardLat, towardLon, b.lat, b.lon)
  )
  const upd = db.prepare('UPDATE tiles SET clan_id = ?, taken_at = ? WHERE id = ?')
  let n = 0
  for (const t of held.slice(0, count)) n += upd.run(toClan, now(), t.id).changes
  return n
}

/* Keep a clan's holding in step with its roster. Called after any join or
   leave; never takes ground a war has already won or lost. */
export function reconcileLand(clanId) {
  const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId)
  if (!clan) return
  const members = db.prepare('SELECT COUNT(*) AS n FROM members WHERE clan_id = ?').get(clanId).n
  const held = db.prepare('SELECT COUNT(*) AS n FROM tiles WHERE clan_id = ?').get(clanId).n
  const want = landFor(members)
  if (want > held) grantTiles(clanId, want - held, clan.cap_lat, clan.cap_lon)
  else if (want < held) releaseTiles(clanId, held - want, clan.cap_lat, clan.cap_lon)
}

/* ------------------------------------------------------------------
   Levels: XP from wars won and wallets recruited.
   ------------------------------------------------------------------ */
export const levelFor = (xp) => Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1)
export const xpForLevel = (lvl) => 50 * (lvl - 1) ** 2

export function addXp(clanId, amount) {
  db.prepare('UPDATE clans SET xp = xp + ? WHERE id = ?').run(amount, clanId)
}

/* ------------------------------------------------------------------
   Reading the world. One shape, served to everybody.
   ------------------------------------------------------------------ */
export function clanRow(c) {
  const members = db.prepare('SELECT address, role, joined_at FROM members WHERE clan_id = ? ORDER BY joined_at').all(c.id)
  const land = db.prepare('SELECT COUNT(*) AS n FROM tiles WHERE clan_id = ?').get(c.id).n
  const lvl = levelFor(c.xp)
  return {
    id: c.id,
    tag: c.tag,
    name: c.name,
    entry: c.entry,
    region: c.region,
    lang: c.lang,
    crest: JSON.parse(c.crest),
    paint: c.paint,
    cap: [c.cap_lat, c.cap_lon],
    trophies: c.trophies,
    xp: c.xp,
    lvl,
    xpInLevel: c.xp - xpForLevel(lvl),
    xpToNext: xpForLevel(lvl + 1) - xpForLevel(lvl),
    wins: c.wins,
    losses: c.losses,
    land,
    members: members.length,
    roster: members.map((m) => ({
      address: m.address,
      handle: db.prepare('SELECT handle FROM wallets WHERE address = ?').get(m.address)?.handle ?? m.address,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    coin: c.coin_addr ? { symbol: c.coin_sym, address: c.coin_addr, curve: c.coin_curve, tx: c.coin_tx } : null,
    foundedAt: c.founded_at,
  }
}

export function readWorld() {
  const clans = db.prepare('SELECT * FROM clans').all().map(clanRow)
  clans.sort((a, b) => b.trophies - a.trophies || b.land - a.land)

  const tiles = db
    .prepare('SELECT id, lat, lon, d_lat AS dLat, d_lon AS dLon, clan_id AS clan FROM tiles WHERE clan_id IS NOT NULL')
    .all()

  const totalTiles = db.prepare('SELECT COUNT(*) AS n FROM tiles').get().n
  const wallets = db.prepare('SELECT COUNT(*) AS n FROM wallets').get().n

  const wars = db.prepare('SELECT * FROM wars ORDER BY started_at DESC LIMIT 40').all().map((w) => ({
    id: w.id, a: w.a_id, b: w.b_id, sa: w.score_a, sb: w.score_b, stake: w.stake,
    startedAt: w.started_at, endsAt: w.ends_at, settledAt: w.settled_at, winner: w.winner_id,
    startBlock: w.start_block, scanBlock: w.scan_block,
  }))

  const bounties = db.prepare('SELECT * FROM bounties ORDER BY created_at DESC LIMIT 60').all().map((b) => ({
    id: b.id, kind: b.kind, title: b.title, reward: b.reward, clan: b.clan_id,
    by: b.by_address, claimedBy: b.claimed_by, state: b.state, createdAt: b.created_at,
  }))

  const events = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 40').all().map((e) => ({
    id: e.id, kind: e.kind, tag: e.tag, text: e.text, at: e.created_at,
  }))

  return {
    clans,
    tiles,
    wars,
    bounties,
    events,
    stats: {
      totalTiles,
      takenTiles: tiles.length,
      claimedPct: totalTiles ? Math.round((tiles.length / totalTiles) * 100) : 0,
      clans: clans.length,
      wallets,
      liveWars: wars.filter((w) => !w.settledAt).length,
      openBounties: bounties.filter((b) => b.state === 'open').length,
    },
  }
}

/* ------------------------------------------------------------------
   Wars settle themselves when the clock runs out. There is always a
   winner: a tie holds for the defender, and the attacker pays the land.
   ------------------------------------------------------------------ */
export function settleDueWars() {
  const due = db.prepare('SELECT * FROM wars WHERE settled_at IS NULL AND ends_at <= ?').all(now())
  for (const w of due) {
    const a = db.prepare('SELECT * FROM clans WHERE id = ?').get(w.a_id)
    const b = db.prepare('SELECT * FROM clans WHERE id = ?').get(w.b_id)
    if (!a || !b) {
      db.prepare('UPDATE wars SET settled_at = ? WHERE id = ?').run(now(), w.id)
      continue
    }
    // a is the attacker; a tie holds for the defender.
    const winner = w.score_a > w.score_b ? a : b
    const loser = winner.id === a.id ? b : a
    const heldByLoser = db.prepare('SELECT COUNT(*) AS n FROM tiles WHERE clan_id = ?').get(loser.id).n
    const taken = transferTiles(loser.id, winner.id, Math.floor(heldByLoser / WAR_LAND_SHARE), winner.cap_lat, winner.cap_lon)
    const margin = Math.abs(w.score_a - w.score_b)
    const trophies = Math.min(80, 10 + Math.round(margin * 12))

    db.exec('BEGIN')
    try {
      db.prepare('UPDATE wars SET settled_at = ?, winner_id = ? WHERE id = ?').run(now(), winner.id, w.id)
      db.prepare('UPDATE clans SET trophies = trophies + ?, wins = wins + 1, xp = xp + ? WHERE id = ?')
        .run(trophies, 30, winner.id)
      db.prepare('UPDATE clans SET trophies = MAX(0, trophies - ?), losses = losses + 1 WHERE id = ?')
        .run(Math.round(trophies / 2), loser.id)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    logEvent('war', winner.tag, `${winner.tag} took the war against ${loser.tag} and ${taken} tiles`)
  }
  return due.length
}

export const newId = () => randomUUID().slice(0, 8)
