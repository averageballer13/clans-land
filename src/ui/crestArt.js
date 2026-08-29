/* The crest, as data.

   One description of a crest, resolved to concrete shapes and colours, so the
   panels can draw it as React and the globe can bake it into a flag texture
   without either one owning the artwork. */

const SIL = {
  // [viewBoxW, viewBoxH, path]
  heater: [100, 118, 'M4 4h92v52c0 34-24 50-46 58C28 106 4 90 4 56V4Z'],
  kite: [86, 126, 'M43 2 84 26v52c0 26-20 38-41 46C22 116 2 104 2 78V26L43 2Z'],
  banner: [92, 130, 'M4 4h84v104l-42-20-42 20V4Z'],
  hex: [104, 118, 'M52 2 100 30v58L52 116 4 88V30L52 2Z'],
  rondel: [112, 112, 'M56 3a53 53 0 1 1 0 106 53 53 0 0 1 0-106Z'],
  lozenge: [96, 124, 'M48 2 94 62 48 122 2 62 48 2Z'],
  pennon: [120, 96, 'M4 4h112L86 48l30 44H4V4Z'],
  tower: [96, 124, 'M4 20 20 8l16 12L48 6l12 14 16-12 16 12v66c0 26-22 36-44 42C26 122 4 112 4 86V20Z'],
  arch: [98, 126, 'M49 2c26 0 45 18 45 44v54c0 14-20 24-45 24S4 114 4 100V46C4 20 23 2 49 2Z'],
  chevronShield: [102, 124, 'M51 2 98 22v56L51 122 4 78V22L51 2Z'],
}

export const CREST_SHAPES = Object.keys(SIL)

export const CREST_FIELDS = [
  'plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire',
  'bordure', 'gyronny', 'barry', 'paly', 'chief', 'base', 'roundel',
]

export const CREST_CHARGES = [
  'none', 'feather', 'bull', 'bolt', 'anvil', 'eye', 'chain', 'crown', 'wolf',
  'candle', 'compass', 'blade', 'star', 'moon', 'flame', 'skull', 'key',
  'hand', 'tower', 'wave', 'arrow', 'orbit',
]

export const CREST_INKS = [
  '#ff6a00', '#ffa733', '#e2a327', '#c2410c', '#e14b62', '#ff5c8a',
  '#2ec27e', '#3fb6a8', '#3f8ecb', '#5ec8ff', '#8b5cf6', '#a06bff',
  '#8fd14f', '#f4f1ec', '#9aa1a9', '#6b7280',
]

export const CREST_GROUNDS = [
  '#101216', '#1c1005', '#171a1f', '#241206', '#0d1418', '#2a1a0a',
  '#0b0b0c', '#1b1420', '#101c18', '#20161c',
]

/* Field divisions, as shapes inside the silhouette. */
function fieldLayers(kind, w, h, ink, ink2) {
  const p = (d, fill, opacity) => ({ d, fill, opacity })
  switch (kind) {
    case 'pale': return [p(`M${w / 2} 0H${w}V${h}H${w / 2}Z`, ink)]
    case 'fess': return [p(`M0 ${h * 0.4}H${w}V${h * 0.62}H0Z`, ink)]
    case 'bend': return [
      p(`M0 0L${w} ${h}V${h * 0.62}L0 ${-h * 0.38}Z`, ink),
      p(`M0 ${h * 0.38}L${w} ${h * 1.38}V${h}L0 ${h * 0.72}Z`, ink2, 0.5),
    ]
    case 'chevron': return [
      p(`M0 ${h} L${w / 2} ${h * 0.34} L${w} ${h} L${w} ${h * 0.78} L${w / 2} ${h * 0.12} L0 ${h * 0.78}Z`, ink),
    ]
    case 'quarterly': return [
      p(`M0 0H${w / 2}V${h / 2}H0Z`, ink),
      p(`M${w / 2} ${h / 2}H${w}V${h}H${w / 2}Z`, ink),
    ]
    case 'saltire': return [
      { d: `M0 0L${w} ${h}`, stroke: ink, strokeWidth: h * 0.16 },
      { d: `M${w} 0L0 ${h}`, stroke: ink, strokeWidth: h * 0.16 },
    ]
    case 'bordure': return [
      { d: `M0 0H${w}V${h}H0Z`, stroke: ink, strokeWidth: h * 0.11, fill: 'none' },
    ]
    case 'gyronny': return [
      p(`M0 0H${w / 2}V${h / 2}Z`, ink),
      p(`M${w} 0V${h / 2}H${w / 2}Z`, ink2),
      p(`M0 ${h}H${w / 2}V${h / 2}Z`, ink2),
      p(`M${w} ${h}V${h / 2}H${w / 2}Z`, ink),
    ]
    case 'barry': return [0, 2, 4].map((i) =>
      p(`M0 ${(h / 6) * i}H${w}V${(h / 6) * (i + 1)}H0Z`, ink))
    case 'paly': return [0, 2, 4].map((i) =>
      p(`M${(w / 6) * i} 0H${(w / 6) * (i + 1)}V${h}H${(w / 6) * i}Z`, ink))
    case 'chief': return [p(`M0 0H${w}V${h * 0.3}H0Z`, ink)]
    case 'base': return [p(`M0 ${h * 0.68}H${w}V${h}H0Z`, ink)]
    case 'roundel': return [
      { circle: [w / 2, h * 0.5, Math.min(w, h) * 0.34], fill: ink },
    ]
    default: return []
  }
}

/* Charges. Simple, high contrast, legible at 24px. Drawn around the origin so
   one transform places any of them. */
const CHARGE = {
  feather: 'M-14 20C-6 2 6-10 14-18l-2 12c-1 7-4 12-9 15l-9 5-2 6h-6Z',
  bull: 'M-16-14c4 6 8 8 16 8s12-2 16-8c2 10-2 16-6 19 2 6-3 13-10 13s-12-7-10-13c-4-3-8-9-6-19Z',
  bolt: 'M2-20-16 4h10l-4 18L18-4H6l6-16Z',
  anvil: 'M-18-8h30l6-6v10l-8 6 6 14h-30l6-14-10-4V-8Z',
  crown: 'M-18 8-14-14l10 10L0-16l4 12 10-10 4 22Z',
  wolf: 'M-16-12l6 4h20l6-4 2 12-6 6v8l-12 4-12-4v-8l-6-6Z',
  blade: 'M-2-20h4l3 26-5 6-5-6ZM-10 8h20v4h-20Z',
  star: 'M0-20 6-6l15 2-11 10 3 15L0 14l-13 7 3-15-11-10 15-2Z',
  moon: 'M6-18a19 19 0 1 0 0 36A22 22 0 0 1 6-18Z',
  flame: 'M0-20c8 8 12 14 12 21A12 12 0 0 1-12 1c0-7 4-13 12-21ZM0-2c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9Z',
  skull: 'M0-18c10 0 16 7 16 15 0 5-2 8-5 10v6h-6v-4h-4v4h-6v-6c-3-2-5-5-5-10 0-8 6-15 10-15ZM-6-4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  key: 'M-4-18a9 9 0 1 1 0 18v14h5v5h-5v5h-5V0a9 9 0 0 1 5-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  hand: 'M-10 14V-6a3 3 0 0 1 6 0v-8a3 3 0 0 1 6 0v8a3 3 0 0 1 6 0v6a3 3 0 0 1 5 2v6c0 6-5 10-11 10h-6c-4 0-6-2-6-4Z',
  wave: 'M-20 2c5-6 10-6 15 0s10 6 15 0v8c-5 6-10 6-15 0s-10-6-15 0Zm0-14c5-6 10-6 15 0s10 6 15 0v8c-5 6-10 6-15 0s-10-6-15 0Z',
  arrow: 'M0-20 14-2H6v18H-6V-2h-8Z',
  tower: 'M-14-10 -10-16h4l2 4h8l2-4h4l4 6v24h-24ZM-4 4h8v10h-8Z',
}

function chargeLayers(kind, ink, ground) {
  switch (kind) {
    case 'none': return []
    case 'eye': return [
      { d: 'M-18 0c6-10 12-14 18-14S12-10 18 0c-6 10-12 14-18 14S-12 10-18 0Z', fill: ink },
      { circle: [0, 0, 5], fill: ground },
    ]
    case 'chain': return [
      { rect: [-16, -6, 14, 12], stroke: ink, strokeWidth: 4, fill: 'none' },
      { rect: [2, -6, 14, 12], stroke: ink, strokeWidth: 4, fill: 'none' },
    ]
    case 'candle': return [
      { rect: [-3, -6, 6, 22], fill: ink },
      { d: 'M0-20c5 6 5 10 0 14-5-4-5-8 0-14Z', fill: ink },
    ]
    case 'compass': return [
      { circle: [0, 0, 16], stroke: ink, strokeWidth: 3, fill: 'none' },
      { d: 'M0-12 4-2l10 4-10 4L0 16-4 6l-10-4 10-4Z', fill: ink },
    ]
    case 'orbit': return [
      { circle: [0, 0, 6], fill: ink },
      { circle: [0, 0, 16], stroke: ink, strokeWidth: 2.5, fill: 'none' },
      { circle: [0, -16, 3.5], fill: ink },
    ]
    default: {
      const d = CHARGE[kind]
      return d ? [{ d, fill: ink }] : []
    }
  }
}

/* Relative luminance, so a charge is never drawn dark on dark. */
function lum(hex) {
  const h = String(hex || '').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  if (!Number.isFinite(n)) return 0
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

// Fields that cover the middle sit behind the charge; the rest leave the ground.
const COVERS_CENTRE = new Set(['pale', 'fess', 'chevron', 'quarterly', 'saltire', 'gyronny', 'barry', 'paly', 'roundel'])

export function chargeInk(spec) {
  if (spec.chargeInk && spec.chargeInk !== 'auto') return spec.chargeInk
  const behind = COVERS_CENTRE.has(spec.field) ? spec.ink : spec.ground
  const bl = lum(behind)
  for (const o of [spec.ink2, spec.ink, '#f4f1ec', '#08090b']) {
    if (Math.abs(lum(o) - bl) >= 0.35) return o
  }
  return bl > 0.5 ? '#08090b' : '#f4f1ec'
}

/* Everything needed to draw one crest, with colours already resolved. */
export function crestParts(spec) {
  const [w, h, silhouette] = SIL[spec?.shape] || SIL.heater
  const ink = spec?.ink || '#ff6a00'
  const ink2 = spec?.ink2 || '#f4f1ec'
  const ground = spec?.ground || '#101216'
  const scale = (Number(spec?.scale) || 1) * Math.min(w, h) / 100

  return {
    w,
    h,
    silhouette,
    ground,
    field: fieldLayers(spec?.field, w, h, ink, ink2),
    charge: chargeLayers(spec?.charge, chargeInk({ ...spec, ink, ink2, ground }), ground),
    chargeTransform: `translate(${w / 2} ${h * 0.52}) scale(${scale})`,
    edge: spec?.edge || 'rgba(244,241,236,0.34)',
  }
}

/* The same crest as a standalone SVG document, for anywhere that cannot render
   React — the flag textures on the globe, for one. */
export function crestSvg(spec, size = 96) {
  const p = crestParts(spec)
  const layer = (l) => {
    const attrs = [
      l.fill !== undefined ? `fill="${l.fill}"` : 'fill="none"',
      l.stroke ? `stroke="${l.stroke}"` : '',
      l.strokeWidth ? `stroke-width="${l.strokeWidth}"` : '',
      l.opacity !== undefined ? `opacity="${l.opacity}"` : '',
    ].filter(Boolean).join(' ')
    if (l.circle) return `<circle cx="${l.circle[0]}" cy="${l.circle[1]}" r="${l.circle[2]}" ${attrs} />`
    if (l.rect) return `<rect x="${l.rect[0]}" y="${l.rect[1]}" width="${l.rect[2]}" height="${l.rect[3]}" ${attrs} />`
    return `<path d="${l.d}" ${attrs} />`
  }
  const id = `c${Math.random().toString(36).slice(2, 8)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.w} ${p.h}" width="${size}" height="${(size * p.h) / p.w}">
<defs><clipPath id="${id}"><path d="${p.silhouette}"/></clipPath></defs>
<g clip-path="url(#${id})">
<rect x="0" y="0" width="${p.w}" height="${p.h}" fill="${p.ground}"/>
${p.field.map(layer).join('')}
<g transform="${p.chargeTransform}">${p.charge.map(layer).join('')}</g>
</g>
<path d="${p.silhouette}" fill="none" stroke="${p.edge}" stroke-width="2"/>
</svg>`
}

/* A deterministic crest, for seeding and for illustrations. */
const hash = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function randomCrest(seed = 'seed') {
  let s = hash(String(seed)) || 1
  const r = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  const pick = (a) => a[Math.floor(r() * a.length)]
  return {
    shape: pick(CREST_SHAPES),
    ground: pick(CREST_GROUNDS),
    field: pick(CREST_FIELDS),
    ink: pick(CREST_INKS),
    ink2: pick(CREST_INKS),
    charge: pick(CREST_CHARGES.filter((c) => c !== 'none')),
    chargeInk: 'auto',
    scale: Number((0.8 + r() * 0.35).toFixed(3)),
  }
}
