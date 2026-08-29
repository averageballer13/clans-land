import { crestParts } from './crestArt.js'

/* One clan's crest. The artwork itself lives in crestArt.js so the globe can
   bake the same drawing into its flag textures. */
function Layer({ l }) {
  const common = {
    fill: l.fill ?? 'none',
    stroke: l.stroke,
    strokeWidth: l.strokeWidth,
    opacity: l.opacity,
  }
  if (l.circle) return <circle cx={l.circle[0]} cy={l.circle[1]} r={l.circle[2]} {...common} />
  if (l.rect) return <rect x={l.rect[0]} y={l.rect[1]} width={l.rect[2]} height={l.rect[3]} {...common} />
  return <path d={l.d} {...common} />
}

export default function Crest({ tag, spec, size = 34, className = '' }) {
  if (!spec) return null
  const p = crestParts(spec)
  const id = `crest-${tag}-${p.w}`
  const ratio = p.w / p.h
  const boxW = ratio >= 1 ? size : size * ratio
  const boxH = ratio >= 1 ? size / ratio : size

  return (
    <svg
      className={className}
      width={boxW}
      height={boxH}
      viewBox={`0 0 ${p.w} ${p.h}`}
      role="img"
      aria-label={`${tag} crest`}
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
      <defs>
        <clipPath id={id}><path d={p.silhouette} /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width={p.w} height={p.h} fill={p.ground} />
        {p.field.map((l, i) => <Layer key={`f${i}`} l={l} />)}
        <g transform={p.chargeTransform}>
          {p.charge.map((l, i) => <Layer key={`c${i}`} l={l} />)}
        </g>
      </g>
      <path d={p.silhouette} fill="none" stroke={p.edge} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
