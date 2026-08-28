// Compacts Natural Earth GeoJSON into a small payload for the globe texture.
// 1:110m on purpose: the globe should read as a clean graphic map, not a survey.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const R = (n) => Math.round(n * 100) / 100

function rings(geom) {
  const out = []
  const push = (ring) => {
    const r = []
    let px = null, py = null
    for (const [x, y] of ring) {
      const rx = R(x), ry = R(y)
      if (rx === px && ry === py) continue
      r.push(rx, ry); px = rx; py = ry
    }
    if (r.length >= 6) out.push(r)
  }
  if (geom.type === 'Polygon') geom.coordinates.forEach(push)
  else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p) => p.forEach(push))
  else if (geom.type === 'LineString') push(geom.coordinates)
  else if (geom.type === 'MultiLineString') geom.coordinates.forEach(push)
  return out
}

const src = 'public/data/land110.json'
const land = JSON.parse(readFileSync(src, 'utf8')).features.flatMap((f) => rings(f.geometry))

writeFileSync('public/data/earth.json', JSON.stringify({ land }))
try { unlinkSync(src) } catch {}
console.log('land rings', land.length)
