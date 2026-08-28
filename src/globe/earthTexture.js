/* Builds the equirectangular Earth maps from Natural Earth 1:50m vectors.
   Three canvases come out of one pass:
     - colour  : ocean, shelf, land, lakes, borders, graticule
     - bump    : land elevation-ish relief used for shading
     - rough   : ocean glossy / land matte, so the sea catches the sun */

const COL = {
  oceanDeep: '#0d151d',
  oceanShallow: '#18242f',
  shelf: 'rgba(255,106,0,0.10)',
  land: '#37322b',
  landHi: '#4a4239',
  coast: 'rgba(255,150,70,0.85)',
  coastGlow: 'rgba(255,106,0,0.22)',
  lake: '#16222c',
  border: 'rgba(244,241,236,0.18)',
  grat: 'rgba(244,241,236,0.07)',
  gratMajor: 'rgba(255,106,0,0.20)',
}

const toXY = (lon, lat, W, H) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]

function tracePath(ctx, ring, W, H, close) {
  ctx.beginPath()
  let prevX = null
  for (let i = 0; i < ring.length; i += 2) {
    const [x, y] = toXY(ring[i], ring[i + 1], W, H)
    // Ring crossing the antimeridian would smear across the whole map.
    if (prevX !== null && Math.abs(x - prevX) > W * 0.5) {
      if (close) ctx.closePath()
      ctx.moveTo(x, y)
    } else if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
    prevX = x
  }
  if (close) ctx.closePath()
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function buildEarthMaps(geo, W = 4096) {
  const H = W / 2
  const colour = makeCanvas(W, H)
  const bump = makeCanvas(W / 2, H / 2)
  const rough = makeCanvas(W / 2, H / 2)
  const c = colour.getContext('2d')
  const b = bump.getContext('2d')
  const r = rough.getContext('2d')

  /* ---------- ocean ---------- */
  const g = c.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, COL.oceanDeep)
  g.addColorStop(0.35, COL.oceanShallow)
  g.addColorStop(0.5, '#1c2b38')
  g.addColorStop(0.65, COL.oceanShallow)
  g.addColorStop(1, COL.oceanDeep)
  c.fillStyle = g
  c.fillRect(0, 0, W, H)

  // Faint depth banding so the sea is not a dead flat fill.
  c.globalAlpha = 0.4
  for (let i = 0; i < 90; i++) {
    const y = (i / 90) * H
    c.fillStyle = i % 2 ? 'rgba(255,255,255,0.008)' : 'rgba(0,0,0,0.02)'
    c.fillRect(0, y, W, H / 90)
  }
  c.globalAlpha = 1

  r.fillStyle = '#8e8e8e' // ocean: a little glossier than land, not a mirror
  r.fillRect(0, 0, rough.width, rough.height)
  b.fillStyle = '#000'
  b.fillRect(0, 0, bump.width, bump.height)

  /* ---------- graticule ---------- */
  c.lineWidth = 1
  for (let lon = -180; lon <= 180; lon += 15) {
    c.strokeStyle = lon % 90 === 0 ? COL.gratMajor : COL.grat
    const [x] = toXY(lon, 0, W, H)
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke()
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    c.strokeStyle = lat === 0 ? COL.gratMajor : COL.grat
    const [, y] = toXY(0, lat, W, H)
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke()
  }

  /* ---------- continental shelf halo ---------- */
  c.save()
  c.shadowColor = 'rgba(255,106,0,0.45)'
  c.shadowBlur = W * 0.006
  c.fillStyle = COL.shelf
  for (const ring of geo.land) { tracePath(c, ring, W, H, true); c.fill() }
  c.restore()

  /* ---------- land ---------- */
  const lg = c.createLinearGradient(0, 0, 0, H)
  lg.addColorStop(0, '#2b2822')
  lg.addColorStop(0.45, COL.landHi)
  lg.addColorStop(0.55, COL.landHi)
  lg.addColorStop(1, '#2b2822')
  c.fillStyle = lg
  for (const ring of geo.land) { tracePath(c, ring, W, H, true); c.fill() }

  // Land on the bump + roughness maps
  b.fillStyle = '#8c8c8c'
  r.fillStyle = '#f2f2f2' // land: matte
  for (const ring of geo.land) {
    tracePath(b, ring, bump.width, bump.height, true); b.fill()
    tracePath(r, ring, rough.width, rough.height, true); r.fill()
  }

  /* ---------- relief noise inside land only ---------- */
  const relief = makeCanvas(bump.width, bump.height)
  const rc = relief.getContext('2d')
  const img = rc.createImageData(relief.width, relief.height)
  let seed = 0x9e37
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + rand() * 135
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  rc.putImageData(img, 0, 0)
  b.save()
  b.globalCompositeOperation = 'source-atop'
  b.globalAlpha = 0.55
  b.drawImage(relief, 0, 0)
  b.restore()

  /* ---------- lakes ---------- */
  c.fillStyle = COL.lake
  for (const ring of geo.lakes) { tracePath(c, ring, W, H, true); c.fill() }
  c.strokeStyle = 'rgba(120,170,210,0.28)'
  c.lineWidth = Math.max(1, W / 4096)
  for (const ring of geo.lakes) { tracePath(c, ring, W, H, true); c.stroke() }

  /* ---------- coastline: glow pass, then hairline ---------- */
  c.save()
  c.strokeStyle = COL.coastGlow
  c.lineWidth = Math.max(3, (W / 4096) * 7)
  c.lineJoin = 'round'
  for (const ring of geo.land) { tracePath(c, ring, W, H, true); c.stroke() }
  c.restore()

  c.strokeStyle = COL.coast
  c.lineWidth = Math.max(1, (W / 4096) * 1.4)
  for (const ring of geo.land) { tracePath(c, ring, W, H, true); c.stroke() }

  /* ---------- political borders ---------- */
  c.strokeStyle = COL.border
  c.lineWidth = Math.max(1, (W / 4096) * 1.1)
  c.setLineDash([(W / 4096) * 7, (W / 4096) * 5])
  for (const ring of geo.borders) { tracePath(c, ring, W, H, false); c.stroke() }
  c.setLineDash([])

  return { colour, bump, rough }
}
