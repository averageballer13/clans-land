import { randomUUID } from 'node:crypto'
import { one, many, run, tx, now, logEvent } from './db.js'

export const CLAN_MAX = 50
export const BANNER_TILES = 6
export const TILES_PER_MEMBER = 3
export const WAR_LAND_SHARE = 5 // the loser gives up a fifth

export const PAINTS = [
  '#ff6a00', '#ffc043', '#e8453c', '#3fb6a8', '#4a90d9', '#a06bff',
  '#8fd14f', '#ff5c8a', '#2ec27e', '#d98b2b', '#ff8ae2', '#5ec8ff',
]

export const landFor = (members) => BANNER_TILES + members * TILES_PER_MEMBER

/* Wei arrives as a string because it does not fit a double. */
export const weiToEth = (wei) => {
  try { return Number(BigInt(wei ?? '0')) / 1e18 } catch { return 0 }
}

const DEG = Math.PI / 180
export function greatCircle(la1, lo1, la2, lo2) {
  const p1 = la1 * DEG, p2 = la2 * DEG, dl = (lo2 - lo1) * DEG
  return Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))
}

/* ------------------------------------------------------------------
   Land.

   Allocation is one statement that picks the nearest free tiles and claims
   them. Two clans founded at the same instant cannot be handed the same
   ground: whichever transaction commits first owns it, and the other sees
   fewer free tiles.
   ------------------------------------------------------------------ */
const DIST = `
  acos(least(1, sin(radians($1)) * sin(radians(lat))
    + cos(radians($1)) * cos(radians(lat)) * cos(radians(lon - $2))))`

export async function grantTiles(clanId, count, fromLat, fromLon) {
  if (count <= 0) return 0
  return run(
    `UPDATE tiles SET clan_id = $3, taken_at = $4
     WHERE id IN (
       SELECT id FROM tiles WHERE clan_id IS NULL
       ORDER BY ${DIST} LIMIT $5
     )`,
    [fromLat, fromLon, clanId, now(), count]
  )
}

export async function releaseTiles(clanId, count, towardLat, towardLon) {
  if (count <= 0) return 0
  // Give up the ground furthest from the capital first.
  return run(
    `UPDATE tiles SET clan_id = NULL, taken_at = NULL
     WHERE id IN (
       SELECT id FROM tiles WHERE clan_id = $3
       ORDER BY ${DIST} DESC LIMIT $4
     )`,
    [towardLat, towardLon, clanId, count]
  )
}

export async function transferTiles(fromClan, toClan, count, towardLat, towardLon) {
  if (count <= 0) return 0
  return run(
    `UPDATE tiles SET clan_id = $4, taken_at = $5
     WHERE id IN (
       SELECT id FROM tiles WHERE clan_id = $3
       ORDER BY ${DIST} LIMIT $6
     )`,
    [towardLat, towardLon, fromClan, toClan, now(), count]
  )
}

/* Keep a clan's holding in step with its roster, after any join or leave. */
export async function reconcileLand(clanId) {
  const clan = await one('SELECT * FROM clans WHERE id = $1', [clanId])
  if (!clan) return
  const members = Number((await one('SELECT COUNT(*)::int AS n FROM members WHERE clan_id = $1', [clanId])).n)
  const held = Number((await one('SELECT COUNT(*)::int AS n FROM tiles WHERE clan_id = $1', [clanId])).n)
  const want = landFor(members)
  if (want > held) await grantTiles(clanId, want - held, clan.cap_lat, clan.cap_lon)
  else if (want < held) await releaseTiles(clanId, held - want, clan.cap_lat, clan.cap_lon)
}

export function tileAt(lat, lon) {
  return one(
    `SELECT id, clan_id FROM tiles
     WHERE $1 BETWEEN lat - d_lat / 2 AND lat + d_lat / 2
       AND $2 BETWEEN lon - d_lon / 2 AND lon + d_lon / 2
     LIMIT 1`,
    [lat, lon]
  )
}

/* ------------------------------------------------------------------
   Levels: XP from wars won and wallets recruited.
   ------------------------------------------------------------------ */
export const levelFor = (xp) => Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1)
export const xpForLevel = (lvl) => 50 * (lvl - 1) ** 2

export const addXp = (clanId, amount) =>
  run('UPDATE clans SET xp = xp + $1 WHERE id = $2', [amount, clanId])

/* ------------------------------------------------------------------
   Reading the world. One shape, served to everybody.
   ------------------------------------------------------------------ */
export async function readWorld() {
  const [clanRows, tiles, tileCount, walletRows, warRows, bountyRows, eventRows, members, requests] =
    await Promise.all([
      many('SELECT * FROM clans'),
      many('SELECT id, lat, lon, d_lat AS "dLat", d_lon AS "dLon", clan_id AS clan FROM tiles WHERE clan_id IS NOT NULL'),
      one('SELECT COUNT(*)::int AS n FROM tiles'),
      many('SELECT address, handle, pnl_wei, trades FROM wallets'),
      many('SELECT * FROM wars ORDER BY started_at DESC LIMIT 40'),
      many('SELECT * FROM bounties ORDER BY created_at DESC LIMIT 60'),
      many('SELECT * FROM events ORDER BY id DESC LIMIT 40'),
      many(`SELECT m.address, m.clan_id, m.role, m.joined_at, w.handle, w.pnl_wei, w.trades
            FROM members m LEFT JOIN wallets w ON w.address = m.address
            ORDER BY m.joined_at`),
      many(`SELECT r.clan_id, r.address, r.created_at, w.handle
            FROM requests r LEFT JOIN wallets w ON w.address = r.address
            ORDER BY r.created_at`),
    ])

  const landBy = new Map()
  for (const t of tiles) landBy.set(t.clan, (landBy.get(t.clan) ?? 0) + 1)

  /* Net ETH a wallet has made trading on Pons, read from the chain. It is what
     ranks players, and a clan's number is simply its members added up. */
  const rosterBy = new Map()
  const pnlBy = new Map()
  for (const m of members) {
    if (!rosterBy.has(m.clan_id)) rosterBy.set(m.clan_id, [])
    const pnl = weiToEth(m.pnl_wei)
    rosterBy.get(m.clan_id).push({
      address: m.address,
      handle: m.handle ?? m.address,
      role: m.role,
      joinedAt: Number(m.joined_at),
      pnl,
      trades: m.trades ?? 0,
    })
    pnlBy.set(m.clan_id, (pnlBy.get(m.clan_id) ?? 0) + pnl)
  }

  const requestsBy = new Map()
  for (const r of requests) {
    if (!requestsBy.has(r.clan_id)) requestsBy.set(r.clan_id, [])
    requestsBy.get(r.clan_id).push({
      address: r.address,
      handle: r.handle ?? r.address,
      at: Number(r.created_at),
    })
  }

  const clans = clanRows.map((c) => {
    const lvl = levelFor(c.xp)
    const roster = rosterBy.get(c.id) ?? []
    return {
      id: c.id,
      tag: c.tag,
      name: c.name,
      entry: c.entry,
      region: c.region,
      lang: c.lang,
      motto: c.motto ?? '',
      crest: typeof c.crest === 'string' ? JSON.parse(c.crest) : c.crest,
      paint: c.paint,
      pnl: Number((pnlBy.get(c.id) ?? 0).toFixed(6)),
      cap: [c.cap_lat, c.cap_lon],
      trophies: c.trophies,
      xp: c.xp,
      lvl,
      xpInLevel: c.xp - xpForLevel(lvl),
      xpToNext: xpForLevel(lvl + 1) - xpForLevel(lvl),
      wins: c.wins,
      losses: c.losses,
      land: landBy.get(c.id) ?? 0,
      members: roster.length,
      roster,
      requests: requestsBy.get(c.id) ?? [],
      coin: c.coin_addr ? { symbol: c.coin_sym, address: c.coin_addr, curve: c.coin_curve, tx: c.coin_tx } : null,
      foundedAt: Number(c.founded_at),
    }
  })
  clans.sort((a, b) => b.trophies - a.trophies || b.land - a.land)

  const wars = warRows.map((w) => ({
    id: w.id, a: w.a_id, b: w.b_id, sa: w.score_a, sb: w.score_b, stake: w.stake,
    startedAt: Number(w.started_at), endsAt: Number(w.ends_at),
    settledAt: w.settled_at == null ? null : Number(w.settled_at),
    winner: w.winner_id,
    startBlock: w.start_block == null ? null : Number(w.start_block),
    scanBlock: w.scan_block == null ? null : Number(w.scan_block),
  }))

  const bounties = bountyRows.map((b) => ({
    id: b.id, kind: b.kind, title: b.title, reward: b.reward, clan: b.clan_id,
    by: b.by_address, claimedBy: b.claimed_by, state: b.state, createdAt: Number(b.created_at),
  }))

  const events = eventRows.map((e) => ({
    id: Number(e.id), kind: e.kind, tag: e.tag, text: e.text, at: Number(e.created_at),
  }))

  /* Every wallet that has ever signed in, ranked by what it has made. */
  const clanOf = new Map(members.map((m) => [m.address, m.clan_id]))
  const players = walletRows
    .map((w) => ({
      address: w.address,
      handle: w.handle,
      clan: clanOf.get(w.address) ?? null,
      pnl: weiToEth(w.pnl_wei),
      trades: w.trades ?? 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)

  const totalTiles = Number(tileCount.n)
  return {
    clans,
    players,
    tiles,
    wars,
    bounties,
    events,
    stats: {
      totalTiles,
      takenTiles: tiles.length,
      claimedPct: totalTiles ? Math.round((tiles.length / totalTiles) * 100) : 0,
      clans: clans.length,
      wallets: walletRows.length,
      traders: players.filter((p) => p.trades > 0).length,
      liveWars: wars.filter((w) => !w.settledAt).length,
      openBounties: bounties.filter((b) => b.state === 'open').length,
    },
  }
}

/* ------------------------------------------------------------------
   Wars settle themselves when the clock runs out. There is always a
   winner: a tie holds for the defender, and the attacker pays the land.
   ------------------------------------------------------------------ */
export async function settleDueWars() {
  const due = await many('SELECT * FROM wars WHERE settled_at IS NULL AND ends_at <= $1', [now()])
  for (const w of due) {
    const a = await one('SELECT * FROM clans WHERE id = $1', [w.a_id])
    const b = await one('SELECT * FROM clans WHERE id = $1', [w.b_id])
    if (!a || !b) {
      await run('UPDATE wars SET settled_at = $1 WHERE id = $2', [now(), w.id])
      continue
    }
    // a is the attacker; a tie holds for the defender.
    const winner = w.score_a > w.score_b ? a : b
    const loser = winner.id === a.id ? b : a
    const heldByLoser = Number((await one('SELECT COUNT(*)::int AS n FROM tiles WHERE clan_id = $1', [loser.id])).n)
    const taken = await transferTiles(
      loser.id, winner.id, Math.floor(heldByLoser / WAR_LAND_SHARE), winner.cap_lat, winner.cap_lon
    )
    const margin = Math.abs(w.score_a - w.score_b)
    const trophies = Math.min(80, 10 + Math.round(margin * 12))

    await tx(async () => {
      await run('UPDATE wars SET settled_at = $1, winner_id = $2 WHERE id = $3', [now(), winner.id, w.id])
      await run('UPDATE clans SET trophies = trophies + $1, wins = wins + 1, xp = xp + 30 WHERE id = $2',
        [trophies, winner.id])
      await run('UPDATE clans SET trophies = GREATEST(0, trophies - $1), losses = losses + 1 WHERE id = $2',
        [Math.round(trophies / 2), loser.id])
    })
    await logEvent('war', winner.tag, `${winner.tag} took the war against ${loser.tag} and ${taken} tiles`)
  }
  return due.length
}

export const newId = () => randomUUID().slice(0, 8)
