/* Clan crests.
   One art direction across the whole set — flat fills, hairline edge,
   no gradients, theme palette only — but each silhouette carries its own
   proportions so two clans never read the same at a glance. */

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
}

/* Field divisions, drawn clipped to the silhouette. */
function Field({ kind, w, h, ink, ink2 }) {
  const p = (d, f) => <path key={d + f} d={d} fill={f} />
  switch (kind) {
    case 'pale':
      return <>{p(`M${w / 2} 0H${w}V${h}H${w / 2}Z`, ink)}</>
    case 'fess':
      return <>{p(`M0 ${h * 0.4}H${w}V${h * 0.62}H0Z`, ink)}</>
    case 'bend':
      return <>{p(`M0 0L${w} ${h}V${h * 0.62}L0 ${-h * 0.38}Z`, ink)}<path d={`M0 ${h * 0.38}L${w} ${h * 1.38}V${h}L0 ${h * 0.72}Z`} fill={ink2} opacity="0.5" /></>
    case 'chevron':
      return <>{p(`M0 ${h} L${w / 2} ${h * 0.34} L${w} ${h} L${w} ${h * 0.78} L${w / 2} ${h * 0.12} L0 ${h * 0.78}Z`, ink)}</>
    case 'quarterly':
      return <>{p(`M0 0H${w / 2}V${h / 2}H0Z`, ink)}{p(`M${w / 2} ${h / 2}H${w}V${h}H${w / 2}Z`, ink)}</>
    case 'saltire':
      return <><path d={`M0 0L${w} ${h}`} stroke={ink} strokeWidth={h * 0.16} /><path d={`M${w} 0L0 ${h}`} stroke={ink} strokeWidth={h * 0.16} /></>
    case 'bordure':
      return <><rect x="0" y="0" width={w} height={h} fill="none" stroke={ink} strokeWidth={h * 0.11} /></>
    case 'gyronny':
      return <>{p(`M0 0H${w / 2}V${h / 2}Z`, ink)}{p(`M${w} 0V${h / 2}H${w / 2}Z`, ink2)}{p(`M0 ${h}H${w / 2}V${h / 2}Z`, ink2)}{p(`M${w} ${h}V${h / 2}H${w / 2}Z`, ink)}</>
    default:
      return null
  }
}

/* Charges. Simple, high-contrast, legible at 24px. */
function Charge({ kind, c }) {
  const s = { fill: c, stroke: 'none' }
  switch (kind) {
    case 'feather': // nods to the chain's own mark without copying it
      return <path {...s} d="M-14 20C-6 2 6-10 14-18l-2 12c-1 7-4 12-9 15l-9 5-2 6h-6Z" />
    case 'bull':
      return <path {...s} d="M-16-14c4 6 8 8 16 8s12-2 16-8c2 10-2 16-6 19 2 6-3 13-10 13s-12-7-10-13c-4-3-8-9-6-19Z" />
    case 'bolt':
      return <path {...s} d="M2-20-16 4h10l-4 18L18-4H6l6-16Z" />
    case 'anvil':
      return <path {...s} d="M-18-8h30l6-6v10l-8 6 6 14h-30l6-14-10-4V-8Z" />
    case 'eye':
      return <><path {...s} d="M-18 0c6-10 12-14 18-14S12-10 18 0c-6 10-12 14-18 14S-12 10-18 0Z" /><circle cx="0" cy="0" r="5" fill="#08090b" /></>
    case 'chain':
      return <><rect x="-16" y="-6" width="14" height="12" fill="none" stroke={c} strokeWidth="4" /><rect x="2" y="-6" width="14" height="12" fill="none" stroke={c} strokeWidth="4" /></>
    case 'crown':
      return <path {...s} d="M-18 8-14-14l10 10L0-16l4 12 10-10 4 22Z" />
    case 'wolf':
      return <path {...s} d="M-16-12l6 4h20l6-4 2 12-6 6v8l-12 4-12-4v-8l-6-6Z" />
    case 'candle':
      return <><rect x="-3" y="-6" width="6" height="22" fill={c} /><path {...s} d="M0-20c5 6 5 10 0 14-5-4-5-8 0-14Z" /></>
    case 'compass':
      return <><circle cx="0" cy="0" r="16" fill="none" stroke={c} strokeWidth="3" /><path {...s} d="M0-12 4-2l10 4-10 4L0 16-4 6l-10-4 10-4Z" /></>
    case 'blade':
      return <path {...s} d="M-2-20h4l3 26-5 6-5-6ZM-10 8h20v4h-20Z" />
    default:
      return null
  }
}

/* Relative luminance, so a charge is never drawn dark-on-dark. */
function lum(hex) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
// Fields that actually cover the middle of the shield sit behind the charge;
// the rest leave the ground showing there.
const COVERS_CENTRE = new Set(['pale', 'fess', 'chevron', 'quarterly', 'saltire', 'gyronny'])

function chargeInk(spec) {
  const behind = COVERS_CENTRE.has(spec.field) ? spec.ink : spec.ground
  const bl = lum(behind)
  const options = [spec.ink2, spec.ink, '#f4f1ec', '#08090b']
  for (const o of options) if (Math.abs(lum(o) - bl) >= 0.35) return o
  return bl > 0.5 ? '#08090b' : '#f4f1ec'
}

export default function Crest({ tag, spec, size = 34, className = '' }) {
  if (!spec) return null
  const [w, h, d] = SIL[spec.shape] || SIL.heater
  const id = `cr-${tag}`
  const ratio = w / h
  const boxW = ratio >= 1 ? size : size * ratio
  const boxH = ratio >= 1 ? size / ratio : size

  return (
    <svg
      className={className}
      width={boxW}
      height={boxH}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${tag} crest`}
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={id}>
          <path d={d} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width={w} height={h} fill={spec.ground} />
        <Field kind={spec.field} w={w} h={h} ink={spec.ink} ink2={spec.ink2} />
        <g transform={`translate(${w / 2} ${h * 0.52}) scale(${(spec.scale * Math.min(w, h)) / 100})`}>
          <Charge kind={spec.charge} c={chargeInk(spec)} />
        </g>
      </g>
      <path d={d} fill="none" stroke="rgba(244,241,236,0.34)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
