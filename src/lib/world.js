import { WORLD_TILES, CLAN_MAX } from './brand.js'

/* ------------------------------------------------------------------
   Genesis state.

   The world ships empty: no clans, no land claimed, no wars, no
   bounties. Everything below is the shape a live Robinhood Chain /
   Pons feed fills in — the first clan founded here is genuinely the
   first clan.
   ------------------------------------------------------------------ */

export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
export const hash = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/* ------------------------------------------------------------------
   Crest system — one art direction, different silhouettes and ratios.
   ------------------------------------------------------------------ */
export const CREST_SHAPES = ['heater', 'kite', 'banner', 'hex', 'rondel', 'lozenge', 'pennon', 'tower']
export const CREST_FIELDS = ['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'bordure', 'gyronny']
export const CREST_CHARGES = ['feather', 'bull', 'bolt', 'anvil', 'eye', 'chain', 'crown', 'wolf', 'candle', 'compass', 'blade', 'none']
export const CREST_INKS = [
  '#ff6a00', '#ffa733', '#e2a327', '#c2410c', '#e14b62',
  '#2ec27e', '#3f8ecb', '#8b5cf6', '#f4f1ec', '#6b7280',
]
export const CREST_GROUNDS = ['#101216', '#1c1005', '#171a1f', '#241206', '#0d1418', '#2a1a0a']

/* Territory paint. Distinct hues that all hold up over the dark map, so two
   neighbouring clans never blur into one another. Handed out in order as
   clans are founded. */
export const PAINTS = [
  '#ff6a00', '#ffc043', '#e8453c', '#3fb6a8', '#4a90d9', '#a06bff',
  '#8fd14f', '#ff5c8a', '#2ec27e', '#d98b2b', '#ff8ae2', '#5ec8ff',
]

export function crestFor(tag) {
  const r = rng(hash(tag + '::crest'))
  const pick = (a) => a[Math.floor(r() * a.length)]
  return {
    shape: pick(CREST_SHAPES),
    ground: pick(CREST_GROUNDS),
    field: pick(CREST_FIELDS),
    ink: pick(CREST_INKS),
    ink2: pick(CREST_INKS),
    charge: pick(CREST_CHARGES),
    scale: 0.8 + r() * 0.35,
  }
}

/* ------------------------------------------------------------------
   Clans — empty until the first one is founded.
   A clan is: { id, name, tag, lvl, trophies, members, entry, region,
   lang, cap: [lat, lon], coin, land, wins, losses, xp, profit, crest,
   paint }
   ------------------------------------------------------------------ */
export const CLANS = []

export const clanBy = (id) => CLANS.find((c) => c.id === id)

export const landFor = (members) => 6 + members * 3

export const TOTAL_LAND = CLANS.reduce((n, c) => n + c.land, 0)
export const CLAIMED_PCT = Math.round((TOTAL_LAND / WORLD_TILES) * 100)
export const WALLETS_LIVE = CLANS.reduce((n, c) => n + c.members, 0)

export const ROLES = ['Leader', 'Co Leader', 'Elder', 'Member']

export function membersOf(clan) {
  return clan?.roster ?? []
}

/* ------------------------------------------------------------------
   Wars and bounties — nothing has happened yet.
   ------------------------------------------------------------------ */
export const LIVE_WARS = []
export const SETTLED_WARS = []
export const BOUNTY_KINDS = ['Recruiting', 'Crest art', 'Trading', 'Open call', 'Research']
export const BOUNTIES = []

/* ------------------------------------------------------------------
   Ticker. With no chain activity yet it carries the launch state.
   ------------------------------------------------------------------ */
export function makeTicker() {
  return [
    { tag: 'GENESIS', text: 'the world is unclaimed', delta: null },
    { tag: 'GENESIS', text: `${WORLD_TILES} tiles open, 0 taken`, delta: null },
    { tag: 'GENESIS', text: 'no clan has been founded yet', delta: null },
    { tag: 'GENESIS', text: 'first clan takes first pick of the map', delta: null },
  ]
}

/* ------------------------------------------------------------------
   Land tiles — the full grid, all of it unclaimed at genesis. Once a
   clan exists it floods the nearest free tiles to its capital.
   ------------------------------------------------------------------ */
export function buildTiles(clans = CLANS) {
  const tiles = []
  const ROWS = 30
  for (let row = 0; row < ROWS; row++) {
    const lat = 90 - (row + 0.5) * (180 / ROWS)
    const cols = Math.max(4, Math.round(40 * Math.cos((lat * Math.PI) / 180)))
    for (let col = 0; col < cols; col++) {
      tiles.push({ lat, lon: -180 + (col + 0.5) * (360 / cols), dLat: 180 / ROWS, dLon: 360 / cols, clan: null })
    }
  }
  for (const clan of clans) {
    const scored = tiles
      .filter((t) => !t.clan)
      .map((t) => ({ t, d: greatCircle(clan.cap[0], clan.cap[1], t.lat, t.lon) }))
      .sort((x, y) => x.d - y.d)
    for (let i = 0; i < clan.land && i < scored.length; i++) scored[i].t.clan = clan.id
  }
  return tiles
}

export function greatCircle(la1, lo1, la2, lo2) {
  const R = Math.PI / 180
  const p1 = la1 * R, p2 = la2 * R, dl = (lo2 - lo1) * R
  return Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))
}

export { WORLD_TILES, CLAN_MAX }
