import { WORLD_TILES, CLAN_MAX } from './brand.js'

/* ------------------------------------------------------------------
   Deterministic pseudo-random so every reload paints the same world.
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
   Palette is locked to the site theme so every crest reads as a set.
   ------------------------------------------------------------------ */
export const CREST_SHAPES = ['heater', 'kite', 'banner', 'hex', 'rondel', 'lozenge', 'pennon', 'tower']
export const CREST_FIELDS = ['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'bordure', 'gyronny']
export const CREST_CHARGES = ['feather', 'bull', 'bolt', 'anvil', 'eye', 'chain', 'crown', 'wolf', 'candle', 'compass', 'blade', 'none']
export const CREST_INKS = [
  '#ff6a00', '#ffa733', '#e2a327', '#c2410c', '#e14b62',
  '#2ec27e', '#3f8ecb', '#8b5cf6', '#f4f1ec', '#6b7280',
]
/* Territory paint. Distinct hues that all hold up over the dark map, so two
   neighbouring clans never blur into one another. */
export const PAINTS = [
  '#ff6a00', '#ffc043', '#e8453c', '#3fb6a8', '#4a90d9', '#a06bff',
  '#8fd14f', '#ff5c8a', '#2ec27e', '#d98b2b', '#ff8ae2', '#5ec8ff',
]

export const CREST_GROUNDS = ['#101216', '#1c1005', '#171a1f', '#241206', '#0d1418', '#2a1a0a']

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
   Clans. `cap` is the capital [lat, lon] the clan paints outward from.
   ------------------------------------------------------------------ */
const RAW = [
  ['Hood Guard', 'HOOD', 6, 231, 14, 'open', 'Worldwide', 'English', [40.71, -74.0], 'HOOD', 41200],
  ['Pons Family', 'PONS', 6, 198, 11, 'invite', 'United States', 'English', [37.77, -122.42], 'PONS', 38400],
  ['Orbit Syndicate', 'ORBT', 5, 164, 9, 'open', 'Worldwide', 'English', [51.5, -0.13], null, 0],
  ['Ember Court', 'EMBR', 4, 132, 7, 'request', 'Worldwide', 'English', [48.86, 2.35], 'EMBR', 12900],
  ['Nightdesk', 'NDSK', 4, 118, 6, 'open', 'Singapore', 'English', [1.35, 103.82], null, 0],
  ['Tape Readers', 'TAPE', 3, 96, 5, 'open', 'Worldwide', 'English', [35.68, 139.69], 'TAPE', 6100],
  ['Bridge Wardens', 'BRDG', 3, 84, 4, 'invite', 'Worldwide', 'English', [52.52, 13.4], null, 0],
  ['Ironbell', 'IRON', 2, 61, 4, 'open', 'Brazil', 'Portuguese', [-23.55, -46.63], null, 0],
  ['Vault Kids', 'VLTK', 2, 48, 3, 'open', 'Worldwide', 'English', [25.2, 55.27], 'VLTK', 2400],
  ['Cold Open', 'COLD', 1, 22, 2, 'open', 'Worldwide', 'English', [59.33, 18.07], null, 0],
  ['Meridian', 'MRDN', 1, 14, 2, 'request', 'Australia', 'English', [-33.87, 151.21], null, 0],
  ['Longwick', 'LWCK', 1, 9, 1, 'open', 'Worldwide', 'English', [19.08, 72.88], null, 0],
]

export const CLANS = RAW.map(([name, tag, lvl, trophies, members, entry, region, lang, cap, coin, mcap], i) => {
  const r = rng(hash(tag))
  return {
    id: tag.toLowerCase(),
    name, tag, lvl, trophies, members, entry, region, lang, cap,
    coin: coin ? { symbol: coin, mcap, vault: Math.round(mcap * 0.031) } : null,
    land: 6 + members * 3,
    wins: Math.floor(r() * 9),
    losses: Math.floor(r() * 7),
    xp: Math.floor(r() * 100),
    profit: Number(((r() - 0.35) * 14).toFixed(2)),
    crest: crestFor(tag),
    paint: PAINTS[i % PAINTS.length],
    founded: `${2026}-0${1 + (i % 8)}-${10 + (i % 18)}`,
  }
}).sort((a, b) => b.trophies - a.trophies)

export const clanBy = (id) => CLANS.find((c) => c.id === id)

export const TOTAL_LAND = CLANS.reduce((n, c) => n + c.land, 0)
export const CLAIMED_PCT = Math.round((TOTAL_LAND / WORLD_TILES) * 100)
export const WALLETS_LIVE = CLANS.reduce((n, c) => n + c.members, 0) * 41 + 137

/* ------------------------------------------------------------------
   Members
   ------------------------------------------------------------------ */
const HANDLE_A = ['iron', 'ash', 'ember', 'null', 'grim', 'vault', 'wire', 'onyx', 'flint', 'quill', 'sable', 'ridge', 'cobalt', 'hollow']
const HANDLE_B = ['baron', 'sentry', 'ward', 'runner', 'smith', 'hand', 'clerk', 'signal', 'wolf', 'anchor', 'lantern', 'archer']
export const ROLES = ['Leader', 'Co Leader', 'Elder', 'Member']

export function membersOf(clan) {
  const r = rng(hash(clan.tag + '::members'))
  return Array.from({ length: clan.members }, (_, i) => {
    const h = `${HANDLE_A[Math.floor(r() * HANDLE_A.length)]}${HANDLE_B[Math.floor(r() * HANDLE_B.length)]}${Math.floor(r() * 90) + 10}`
    return {
      handle: h,
      role: i === 0 ? 'Leader' : i < 3 ? 'Co Leader' : i < 6 ? 'Elder' : 'Member',
      pnl: Number(((r() - 0.4) * 6).toFixed(3)),
      trophies: Math.floor(r() * 70),
      addr: '0x' + Array.from({ length: 8 }, () => Math.floor(r() * 16).toString(16)).join('') + '…' + Array.from({ length: 4 }, () => Math.floor(r() * 16).toString(16)).join(''),
    }
  })
}

/* ------------------------------------------------------------------
   Wars — one number a side, net ETH made on Pons during the window.
   ------------------------------------------------------------------ */
export const LIVE_WARS = [
  { id: 'w-live-1', a: 'hood', b: 'orbt', sa: 2.41, sb: 1.88, endsIn: 4 * 3600 + 1180, stake: 12 },
  { id: 'w-live-2', a: 'embr', b: 'ndsk', sa: -0.32, sb: 0.44, endsIn: 11 * 3600 + 240, stake: 7 },
]

export const SETTLED_WARS = (() => {
  const r = rng(0xc1a5)
  const ids = CLANS.map((c) => c.id)
  return Array.from({ length: 22 }, (_, i) => {
    const a = ids[Math.floor(r() * ids.length)]
    let b = ids[Math.floor(r() * ids.length)]
    if (b === a) b = ids[(ids.indexOf(a) + 3) % ids.length]
    const sa = Number(((r() - 0.45) * 5).toFixed(2))
    const sb = Number(((r() - 0.45) * 5).toFixed(2))
    return { id: `w-${i}`, a, b, sa, sb, winner: sa > sb ? a : b, ago: `${i + 1}d` }
  })
})()

/* ------------------------------------------------------------------
   Bounties
   ------------------------------------------------------------------ */
export const BOUNTY_KINDS = ['Recruiting', 'Crest art', 'Trading', 'Open call', 'Research']
export const BOUNTIES = [
  { id: 'b1', kind: 'Recruiting', clan: 'HOOD', title: 'Bring three wallets with 30d PnL above zero into Hood Guard.', by: 'flintsentry42', reward: 0.04, state: 'open', ago: '3h' },
  { id: 'b2', kind: 'Crest art', clan: 'EMBR', title: 'Redraw the Ember Court crest as a banner silhouette, same palette.', by: 'quillclerk17', reward: 0.02, state: 'open', ago: '9h' },
  { id: 'b3', kind: 'Research', clan: 'ORBT', title: 'Map every Pons deploy over 100k mcap in the last 7 days.', by: 'onyxward28', reward: 0.06, state: 'open', ago: '1d' },
  { id: 'b4', kind: 'Trading', clan: 'PONS', title: 'Hold the war line: net positive ETH through Friday close.', by: 'ashrunner55', reward: 0.1, state: 'claimed', claimedBy: 'wirebaron42', ago: '2d' },
  { id: 'b5', kind: 'Open call', clan: 'TAPE', title: 'Anyone who charts the CLANS vault flow gets paid.', by: 'sablehand61', reward: 0.03, state: 'done', claimedBy: 'ridgesignal19', ago: '5d' },
]

/* ------------------------------------------------------------------
   Live-ish feed
   ------------------------------------------------------------------ */
const FEED_LINES = [
  (c) => `${c.tag} painted 3 tiles around its capital`,
  (c) => `${c.tag} accepted a new wallet`,
  (c) => `${c.tag} declared a war`,
  (c) => `${c.tag} took the war and a fifth of the land`,
  (c) => `${c.tag} deployed a clan coin on Pons`,
  (c) => `${c.tag} reached level ${c.lvl}`,
  (c) => `${c.tag} posted a bounty`,
]

export function makeTicker(n = 26) {
  const r = rng(0x7e11)
  return Array.from({ length: n }, () => {
    const c = CLANS[Math.floor(r() * CLANS.length)]
    const line = FEED_LINES[Math.floor(r() * FEED_LINES.length)]
    return { text: line(c), tag: c.tag, delta: Number(((r() - 0.4) * 3).toFixed(2)) }
  })
}

/* ------------------------------------------------------------------
   Land tiles — every clan paints outward from its capital.
   Returned as { lat, lon, clan } on a 1200-cell equal-area-ish grid.
   ------------------------------------------------------------------ */
export function buildTiles() {
  const tiles = []
  const ROWS = 30
  for (let row = 0; row < ROWS; row++) {
    const lat = 90 - (row + 0.5) * (180 / ROWS)
    const cols = Math.max(4, Math.round(40 * Math.cos((lat * Math.PI) / 180)))
    for (let col = 0; col < cols; col++) {
      tiles.push({ lat, lon: -180 + (col + 0.5) * (360 / cols), dLat: 180 / ROWS, dLon: 360 / cols, clan: null })
    }
  }
  // Each clan floods the nearest unclaimed tiles to its capital.
  for (const clan of CLANS) {
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
