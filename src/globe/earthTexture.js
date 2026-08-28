/* Builds the equirectangular Earth map from Natural Earth 1:110m land.
   Deliberately graphic rather than cartographic: flat ocean, flat land, one
   hairline coast, a faint graticule. Nothing else competes with the clans. */

const COL = {
  ocean: '#0c141d',
  land: '#3d362d',
  coast: 'rgba(255,140,60,0.7)',
  grat: 'rgba(244,241,236,0.055)',
  gratMajor: 'rgba(255,106,0,0.14)',
}

const toXY = (lon, lat, W, H) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]

function tracePath(ctx, ring, W, H) {
  ctx.beginPath()
  let prevX = null
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y] = toXY(ring[i], ring[i + 1], W, H)
    // A ring crossing the antimeridian would otherwise smear across the map.
    if (prevX !== null && Math.abs(x - prevX) > W * 0.5) {
      ctx.closePath()
      ctx.moveTo(x, y)
    } else if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
    prevX = x
  }
  ctx.closePath()
}

export function buildEarthMap(geo, W = 2048) {
  const H = W / 2
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')

  c.fillStyle = COL.ocean
  c.fillRect(0, 0, W, H)

  c.lineWidth = 1
  for (let lon = -180; lon <= 180; lon += 30) {
    c.strokeStyle = lon % 90 === 0 ? COL.gratMajor : COL.grat
    const [x] = toXY(lon, 0, W, H)
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    c.strokeStyle = lat === 0 ? COL.gratMajor : COL.grat
    const [, y] = toXY(0, lat, W, H)
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke()
  }

  c.fillStyle = COL.land
  c.lineJoin = 'round'
  for (const ring of geo.land) { tracePath(c, ring, W, H); c.fill() }

  c.strokeStyle = COL.coast
  c.lineWidth = Math.max(1, (W / 2048) * 1.6)
  for (const ring of geo.land) { tracePath(c, ring, W, H); c.stroke() }

  return cv
}
