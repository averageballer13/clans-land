/* The crest vocabulary. One art direction: different silhouettes and
   proportions, but a single locked palette so every clan reads as part of
   the same set. The server validates against these exact lists. */

export const CREST_SHAPES = ['heater', 'kite', 'banner', 'hex', 'rondel', 'lozenge', 'pennon', 'tower']
export const CREST_FIELDS = ['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'bordure', 'gyronny']
export const CREST_CHARGES = ['feather', 'bull', 'bolt', 'anvil', 'eye', 'chain', 'crown', 'wolf', 'candle', 'compass', 'blade', 'none']
export const CREST_INKS = [
  '#ff6a00', '#ffa733', '#e2a327', '#c2410c', '#e14b62',
  '#2ec27e', '#3f8ecb', '#8b5cf6', '#f4f1ec', '#6b7280',
]
export const CREST_GROUNDS = ['#101216', '#1c1005', '#171a1f', '#241206', '#0d1418', '#2a1a0a']

const hash = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

export function randomCrest(seed = 'seed') {
  const r = rng(hash(String(seed)))
  const pick = (a) => a[Math.floor(r() * a.length)]
  return {
    shape: pick(CREST_SHAPES),
    ground: pick(CREST_GROUNDS),
    field: pick(CREST_FIELDS),
    ink: pick(CREST_INKS),
    ink2: pick(CREST_INKS),
    charge: pick(CREST_CHARGES),
    scale: Number((0.8 + r() * 0.35).toFixed(3)),
  }
}
