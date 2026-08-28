// Compacts Natural Earth GeoJSON into a single small payload for the globe texture.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

const R = (n) => Math.round(n * 1000) / 1000

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

const load = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8')).features

const land = load('land50.json').flatMap((f) => rings(f.geometry))
const borders = load('borders.json').flatMap((f) => rings(f.geometry))
const lakes = load('lakes.json')
  .filter((f) => (f.properties.scalerank ?? 9) <= 3)
  .flatMap((f) => rings(f.geometry))

const payload = { land, borders, lakes }
writeFileSync('public/data/earth.json', JSON.stringify(payload))
for (const f of ['land50.json', 'borders.json', 'lakes.json']) {
  try { unlinkSync(`public/data/${f}`) } catch {}
}
console.log('land rings', land.length, 'borders', borders.length, 'lakes', lakes.length)
