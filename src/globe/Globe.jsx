import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildEarthMap } from './earthTexture.js'

const R = 1
const DEG = Math.PI / 180

function llToVec(lat, lon, r = R) {
  const p = (90 - lat) * DEG
  const t = (lon + 180) * DEG
  return new THREE.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t))
}

function vecToLL(v) {
  const n = v.clone().normalize()
  const lat = 90 - Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG
  let lon = Math.atan2(n.z, -n.x) / DEG - 180
  if (lon < -180) lon += 360
  return [lat, lon]
}

/* Land paint: a soft tint per tile plus a crisp edge, both merged into one
   draw call each. The tint stays low so the map underneath stays readable —
   the edges are what make a territory legible. */
function buildTileLayers(tiles, colourOf) {
  const pos = [], col = [], idx = [], epos = [], ecol = []
  const SEG = 2
  let n = 0

  const byRow = new Map()
  for (const t of tiles) {
    const key = t.lat.toFixed(3)
    if (!byRow.has(key)) byRow.set(key, [])
    byRow.get(key).push(t)
  }
  const rowLats = [...byRow.keys()].map(Number).sort((a, b) => a - b)
  const neighbourAbove = (t) => {
    const i = rowLats.indexOf(Number(t.lat.toFixed(3)))
    const row = byRow.get(rowLats[i + 1]?.toFixed(3))
    return row?.find((o) => Math.abs(o.lon - t.lon) <= o.dLon / 2)?.clan ?? null
  }
  const neighbourBelow = (t) => {
    const i = rowLats.indexOf(Number(t.lat.toFixed(3)))
    const row = byRow.get(rowLats[i - 1]?.toFixed(3))
    return row?.find((o) => Math.abs(o.lon - t.lon) <= o.dLon / 2)?.clan ?? null
  }

  for (const t of tiles) {
    const c = new THREE.Color(colourOf(t.clan))
    const lat0 = t.lat - t.dLat / 2, lon0 = t.lon - t.dLon / 2

    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j <= SEG; j++) {
        const v = llToVec(lat0 + (t.dLat * i) / SEG, lon0 + (t.dLon * j) / SEG, R * 1.003)
        pos.push(v.x, v.y, v.z)
        col.push(c.r, c.g, c.b)
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = n + i * (SEG + 1) + j
        idx.push(a, a + SEG + 1, a + 1, a + 1, a + SEG + 1, a + SEG + 2)
      }
    }
    n += (SEG + 1) * (SEG + 1)

    const corners = [
      [lat0, lon0], [lat0, lon0 + t.dLon],
      [lat0 + t.dLat, lon0 + t.dLon], [lat0 + t.dLat, lon0],
    ]
    const sides = [
      { a: 0, b: 1, other: neighbourBelow(t) },
      { a: 1, b: 2, other: null },
      { a: 2, b: 3, other: neighbourAbove(t) },
      { a: 3, b: 0, other: null },
    ]
    for (const s of sides) {
      if (s.other === t.clan) continue
      const steps = 6
      const [la1, lo1] = corners[s.a], [la2, lo2] = corners[s.b]
      for (let k = 0; k < steps; k++) {
        const p = llToVec(la1 + ((la2 - la1) * k) / steps, lo1 + ((lo2 - lo1) * k) / steps, R * 1.006)
        const q = llToVec(la1 + ((la2 - la1) * (k + 1)) / steps, lo1 + ((lo2 - lo1) * (k + 1)) / steps, R * 1.006)
        epos.push(p.x, p.y, p.z, q.x, q.y, q.z)
        ecol.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.17,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }))

  const eg = new THREE.BufferGeometry()
  eg.setAttribute('position', new THREE.Float32BufferAttribute(epos, 3))
  eg.setAttribute('color', new THREE.Float32BufferAttribute(ecol, 3))
  const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false,
  }))

  return { fill, edges }
}

function buildCapitals(clans) {
  const group = new THREE.Group()
  for (const c of clans) {
    const base = llToVec(c.cap[0], c.cap[1], R * 1.005)
    const top = llToVec(c.cap[0], c.cap[1], R * (1.06 + Math.min(c.land, 90) / 900))
    const col = new THREE.Color(c.paint)
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([base, top]),
      new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.85 })
    ))
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 12), new THREE.MeshBasicMaterial({ color: col }))
    dot.position.copy(top)
    group.add(dot)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.032, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    halo.position.copy(base)
    halo.lookAt(base.clone().multiplyScalar(2))
    halo.userData.pulse = Math.random() * Math.PI * 2
    group.add(halo)
  }
  return group
}

const ATMO_VERT = `
varying vec3 vN; varying vec3 vP;
void main(){ vN = normalize(normalMatrix * normal); vP = normalize((modelViewMatrix * vec4(position,1.)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`

const ATMO_FRAG = `
uniform vec3 uColor; uniform float uPower; uniform float uStrength;
varying vec3 vN; varying vec3 vP;
void main(){
  float rim = pow(clamp(1.0 - abs(dot(vN, -vP)), 0.0, 1.0), uPower);
  gl_FragColor = vec4(uColor, rim * uStrength);
}`

function disposeTree(obj) {
  obj.traverse?.((o) => {
    o.geometry?.dispose?.()
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
  })
}

export default function Globe({ tiles = [], clans = [], onHover, onPick, onPickPoint, pickMode = false, marker = null, focus, paused }) {
  const ref = useRef(null)
  const api = useRef({})

  /* ---- scene, built once ---- */
  useEffect(() => {
    const canvas = ref.current
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
      // dev only: lets tooling read the frame back for visual checks
      preserveDrawingBuffer: import.meta.env.DEV,
    })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.95

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 3.05)

    const sun = new THREE.DirectionalLight(0xfff2e2, 0.55)
    sun.position.set(-2.2, 1.1, 2.4)
    scene.add(sun)
    scene.add(new THREE.AmbientLight(0xcdd6e2, 3.1))
    const rim = new THREE.DirectionalLight(0xff7a1a, 0.4)
    rim.position.set(2.6, -0.8, -2)
    scene.add(rim)

    const starGeo = new THREE.BufferGeometry()
    const sp = [], sc = []
    for (let i = 0; i < 2600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(28 + Math.random() * 22)
      sp.push(v.x, v.y, v.z)
      const t = Math.random()
      sc.push(0.55 + t * 0.45, 0.55 + t * 0.4, 0.6 + t * 0.4)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3))
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.75, sizeAttenuation: true }))
    scene.add(stars)

    const world = new THREE.Group()
    scene.add(world)

    const earthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMat)
    world.add(earth)

    const atmoIn = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.012, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        uniforms: { uColor: { value: new THREE.Color(0xff8a3c) }, uPower: { value: 5.0 }, uStrength: { value: 0.42 } },
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false,
      })
    )
    world.add(atmoIn)

    // Outer halo: a camera-facing radial gradient behind the planet, hollow
    // inside its silhouette. A second shader shell would peak at its own limb
    // and read as a hard ring.
    const haloCv = document.createElement('canvas')
    haloCv.width = haloCv.height = 512
    const hx = haloCv.getContext('2d')
    const hg = hx.createRadialGradient(256, 256, 0, 256, 256, 256)
    hg.addColorStop(0, 'rgba(255,122,26,0)')
    hg.addColorStop(0.575, 'rgba(255,122,26,0)')
    hg.addColorStop(0.60, 'rgba(255,110,20,0.26)')
    hg.addColorStop(0.70, 'rgba(255,90,8,0.10)')
    hg.addColorStop(0.85, 'rgba(255,72,0,0.03)')
    hg.addColorStop(1, 'rgba(0,0,0,0)')
    hx.fillStyle = hg
    hx.fillRect(0, 0, 512, 512)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCv), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }))
    halo.scale.setScalar(R * 3.4)
    halo.renderOrder = -1
    scene.add(halo)

    // Where a clan is about to plant its capital.
    const pin = new THREE.Group()
    pin.visible = false
    const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 14), new THREE.MeshBasicMaterial({ color: 0xff6a00 }))
    const pinRing = new THREE.Mesh(
      new THREE.RingGeometry(0.026, 0.04, 40),
      new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    )
    pin.add(pinDot, pinRing)
    world.add(pin)

    fetch('/data/earth.json')
      .then((r) => r.json())
      .then((geo) => {
        const size = Math.min(renderer.capabilities.maxTextureSize, 2048)
        const tex = new THREE.CanvasTexture(buildEarthMap(geo, size))
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        tex.colorSpace = THREE.SRGBColorSpace
        earthMat.map = tex
        earthMat.needsUpdate = true
      })
      .catch(() => { /* the globe still turns, just grey */ })

    /* ---- controls ---- */
    let rotY = -1.35, rotX = -0.22, dist = 3.05
    let targetY = rotY, targetX = rotX, targetDist = dist
    let spin = 0.00035
    let dragging = false, lastX = 0, lastY = 0, moved = 0

    const onDown = (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing' }
    const onUp = () => { dragging = false; canvas.style.cursor = api.current.pickMode ? 'crosshair' : 'grab' }
    const onMove = (e) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY
        moved += Math.abs(dx) + Math.abs(dy)
        targetY += dx * 0.0052
        targetX = THREE.MathUtils.clamp(targetX + dy * 0.0045, -1.25, 1.25)
        lastX = e.clientX; lastY = e.clientY
      }
      pointer.x = (e.clientX / innerWidth) * 2 - 1
      pointer.y = -(e.clientY / innerHeight) * 2 + 1
      pointerPx = { x: e.clientX, y: e.clientY }
      hoverDirty = true
    }
    const onWheel = (e) => {
      e.preventDefault()
      targetDist = THREE.MathUtils.clamp(targetDist + e.deltaY * 0.0016, 1.45, 5.2)
    }
    const onClick = () => {
      if (moved >= 6) return
      if (api.current.pickMode) { if (hoverLL) api.current.onPickPoint?.(hoverLL[0], hoverLL[1]) }
      else if (hoverTile?.clan) api.current.onPick?.(hoverTile.clan)
    }

    canvas.addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    addEventListener('pointermove', onMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('click', onClick)
    canvas.style.cursor = 'grab'

    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2(2, 2)
    let pointerPx = { x: 0, y: 0 }
    let hoverDirty = false
    let hoverTile = null
    let hoverLL = null

    const tileAt = (lat, lon) => {
      for (const t of api.current.tiles || []) {
        if (Math.abs(t.lat - lat) <= t.dLat / 2) {
          let d = lon - t.lon
          while (d > 180) d -= 360
          while (d < -180) d += 360
          if (Math.abs(d) <= t.dLon / 2) return t
        }
      }
      return null
    }

    const resize = () => {
      // A hidden or collapsed container reports 0, and 0 / 0 would poison the
      // projection matrix with NaN for the rest of the session.
      const w = Math.max(1, canvas.clientWidth || innerWidth || 1)
      const h = Math.max(1, canvas.clientHeight || innerHeight || 1)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    api.current.flyTo = (lat, lon, zoom = 2.1) => {
      targetY = -(lon + 180) * DEG - Math.PI / 2
      targetX = THREE.MathUtils.clamp(lat * DEG, -1.25, 1.25)
      targetDist = zoom
      spin = 0
      setTimeout(() => { spin = 0.00035 }, 4000)
    }
    api.current.setMarker = (ll) => {
      if (!ll) { pin.visible = false; return }
      const at = llToVec(ll[0], ll[1], R * 1.01)
      pin.position.copy(at)
      pinRing.lookAt(at.clone().multiplyScalar(2))
      pinRing.position.set(0, 0, 0)
      pinDot.position.set(0, 0, 0)
      pin.visible = true
    }
    api.current.world = world
    if (import.meta.env.DEV) window.__globe = { renderer, scene, camera, api: api.current }

    let raf = 0
    let last = performance.now()
    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(now - last, 60)
      last = now
      if (api.current.paused) return

      if (!dragging) targetY += spin * dt
      rotY += (targetY - rotY) * 0.085
      rotX += (targetX - rotX) * 0.085
      dist += (targetDist - dist) * 0.075
      world.rotation.y = rotY
      world.rotation.x = rotX
      camera.position.z = dist
      stars.rotation.y += 0.000012 * dt

      const t = now * 0.001
      api.current.capitals?.children.forEach((c) => {
        if (c.userData.pulse !== undefined) {
          c.scale.setScalar(1 + Math.sin(t * 1.4 + c.userData.pulse) * 0.28)
          c.material.opacity = 0.5 - Math.sin(t * 1.4 + c.userData.pulse) * 0.22
        }
      })
      if (pin.visible) pinRing.scale.setScalar(1 + Math.sin(t * 3) * 0.18)

      if (hoverDirty) {
        hoverDirty = false
        ray.setFromCamera(pointer, camera)
        const hit = ray.intersectObject(earth, false)[0]
        if (hit) {
          const local = world.worldToLocal(hit.point.clone())
          hoverLL = vecToLL(local)
          const tile = tileAt(hoverLL[0], hoverLL[1])
          hoverTile = tile
          api.current.onHover?.({ clan: tile?.clan ?? null, lat: hoverLL[0], lon: hoverLL[1] }, pointerPx)
          canvas.style.cursor = dragging ? 'grabbing'
            : api.current.pickMode ? 'crosshair'
              : tile?.clan ? 'pointer' : 'grab'
        } else if (hoverLL) {
          hoverLL = null
          hoverTile = null
          api.current.onHover?.(null, pointerPx)
        }
      }

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointermove', onMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('click', onClick)
      renderer.dispose()
      disposeTree(scene)
    }
  }, [])

  /* ---- handlers and flags read by the loop without rebuilding the scene ---- */
  useEffect(() => { api.current.onHover = onHover }, [onHover])
  useEffect(() => { api.current.onPick = onPick }, [onPick])
  useEffect(() => { api.current.onPickPoint = onPickPoint }, [onPickPoint])
  useEffect(() => { api.current.pickMode = pickMode }, [pickMode])
  useEffect(() => { api.current.paused = paused }, [paused])
  useEffect(() => { api.current.tiles = tiles }, [tiles])
  useEffect(() => { api.current.setMarker?.(marker) }, [marker])
  useEffect(() => { if (focus && api.current.flyTo) api.current.flyTo(focus[0], focus[1], focus[2] ?? 2.1) }, [focus])

  /* ---- land and capitals, rebuilt whenever the shared world changes ---- */
  useEffect(() => {
    const world = api.current.world
    if (!world) return
    const paint = new Map(clans.map((c) => [c.id, c.paint]))
    const colourOf = (id) => paint.get(id) || '#ff6a00'

    const { fill, edges } = buildTileLayers(tiles, colourOf)
    const capitals = buildCapitals(clans)
    world.add(fill, edges, capitals)
    api.current.capitals = capitals

    return () => {
      world.remove(fill, edges, capitals)
      disposeTree(fill); disposeTree(edges); disposeTree(capitals)
      if (api.current.capitals === capitals) api.current.capitals = null
    }
  }, [tiles, clans])

  return <canvas className="globe" ref={ref} />
}
