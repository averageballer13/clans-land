import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { verifyMessage, isAddress, getAddress } from 'viem'
import { db, now, logEvent, ensureGrid } from './db.js'
import {
  readWorld, clanRow, grantTiles, reconcileLand, settleDueWars, newId,
  landFor, levelFor, addXp, PAINTS, CLAN_MAX,
} from './world.js'
import { verifyLaunch, scanTrades, head, toEth, CHAIN_ID } from './chain.js'

const PORT = Number(process.env.PORT || 8787)
const app = express()
app.use(express.json({ limit: '64kb' }))

const total = ensureGrid()
console.log(`[clans] world grid ready: ${total} tiles`)

/* ------------------------------------------------------------------
   Live updates. Any mutation bumps a version; connected clients are
   told to refetch, so every browser converges on the same world.
   ------------------------------------------------------------------ */
let version = 1
const streams = new Set()
function broadcast() {
  version++
  const line = `data: ${JSON.stringify({ v: version })}\n\n`
  for (const res of streams) { try { res.write(line) } catch { /* dropped */ } }
}

app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()
  res.write(`data: ${JSON.stringify({ v: version })}\n\n`)
  streams.add(res)
  const beat = setInterval(() => { try { res.write(': ping\n\n') } catch { /* dropped */ } }, 25000)
  req.on('close', () => { clearInterval(beat); streams.delete(res) })
})

/* ------------------------------------------------------------------
   Auth: prove you hold the wallet by signing a nonce. No passwords,
   no custody, nothing to leak.
   ------------------------------------------------------------------ */
const HANDLE_A = ['iron', 'ash', 'ember', 'null', 'grim', 'vault', 'wire', 'onyx', 'flint', 'quill', 'sable', 'ridge', 'cobalt', 'hollow']
const HANDLE_B = ['baron', 'sentry', 'ward', 'runner', 'smith', 'hand', 'clerk', 'signal', 'wolf', 'anchor', 'lantern', 'archer']
function handleFor(address) {
  const n = parseInt(address.slice(2, 10), 16)
  return `${HANDLE_A[n % HANDLE_A.length]}${HANDLE_B[(n >> 4) % HANDLE_B.length]}${(n >> 8) % 90 + 10}`
}

const signInMessage = (address, nonce) =>
  `clans.land wants you to sign in with your wallet.\n\n` +
  `Address: ${address}\n` +
  `Nonce: ${nonce}\n\n` +
  `Signing costs nothing and grants no access to your funds.`

app.get('/api/auth/nonce', (req, res) => {
  const raw = String(req.query.address || '')
  if (!isAddress(raw)) return res.status(400).json({ error: 'bad address' })
  const address = getAddress(raw)
  const nonce = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO nonces (nonce, address, created_at) VALUES (?, ?, ?)').run(nonce, address, now())
  db.prepare('DELETE FROM nonces WHERE created_at < ?').run(now() - 10 * 60 * 1000)
  res.json({ nonce, message: signInMessage(address, nonce) })
})

app.post('/api/auth/verify', async (req, res) => {
  const { address: raw, nonce, signature } = req.body || {}
  if (!isAddress(raw || '')) return res.status(400).json({ error: 'bad address' })
  const address = getAddress(raw)
  const row = db.prepare('SELECT * FROM nonces WHERE nonce = ? AND address = ?').get(nonce, address)
  if (!row) return res.status(400).json({ error: 'unknown or expired nonce' })

  let ok = false
  try {
    ok = await verifyMessage({ address, message: signInMessage(address, nonce), signature })
  } catch { ok = false }
  db.prepare('DELETE FROM nonces WHERE nonce = ?').run(nonce)
  if (!ok) return res.status(401).json({ error: 'signature does not match' })

  const existing = db.prepare('SELECT * FROM wallets WHERE address = ?').get(address)
  if (existing) db.prepare('UPDATE wallets SET seen_at = ? WHERE address = ?').run(now(), address)
  else {
    db.prepare('INSERT INTO wallets (address, handle, created_at, seen_at) VALUES (?, ?, ?, ?)')
      .run(address, handleFor(address), now(), now())
    broadcast()
  }

  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token, address, created_at) VALUES (?, ?, ?)').run(token, address, now())
  res.json({ token, address, handle: db.prepare('SELECT handle FROM wallets WHERE address = ?').get(address).handle })
})

function auth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '')
  const s = token && db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!s) return res.status(401).json({ error: 'sign in first' })
  req.address = s.address
  next()
}

app.post('/api/auth/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run((req.get('authorization') || '').replace(/^Bearer /, ''))
  res.json({ ok: true })
})

/* ------------------------------------------------------------------
   World
   ------------------------------------------------------------------ */
app.get('/api/world', (_req, res) => {
  settleDueWars()
  res.json({ v: version, ...readWorld() })
})

app.get('/api/me', auth, (req, res) => {
  const w = db.prepare('SELECT * FROM wallets WHERE address = ?').get(req.address)
  const m = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  res.json({
    address: req.address,
    handle: w?.handle,
    clan: m ? { id: m.clan_id, role: m.role } : null,
  })
})

/* ------------------------------------------------------------------
   Clans
   ------------------------------------------------------------------ */
const TAG_RE = /^[A-Z0-9]{3,6}$/
const ENTRIES = new Set(['public', 'private'])

function validateCrest(c) {
  const hex = /^#[0-9a-fA-F]{6}$/
  const shapes = new Set(['heater', 'kite', 'banner', 'hex', 'rondel', 'lozenge', 'pennon', 'tower'])
  const fields = new Set(['plain', 'pale', 'fess', 'bend', 'chevron', 'quarterly', 'saltire', 'bordure', 'gyronny'])
  const charges = new Set(['feather', 'bull', 'bolt', 'anvil', 'eye', 'chain', 'crown', 'wolf', 'candle', 'compass', 'blade', 'none'])
  if (!c || !shapes.has(c.shape) || !fields.has(c.field) || !charges.has(c.charge)) return null
  if (!hex.test(c.ink || '') || !hex.test(c.ink2 || '') || !hex.test(c.ground || '')) return null
  const scale = Number(c.scale)
  return {
    shape: c.shape, field: c.field, charge: c.charge,
    ink: c.ink, ink2: c.ink2, ground: c.ground,
    scale: Number.isFinite(scale) ? Math.min(1.4, Math.max(0.6, scale)) : 1,
  }
}

app.post('/api/clans', auth, (req, res) => {
  if (db.prepare('SELECT 1 FROM members WHERE address = ?').get(req.address))
    return res.status(409).json({ error: 'you already belong to a clan' })

  const { name, tag: rawTag, entry, region, lang, crest: rawCrest, cap } = req.body || {}
  const tag = String(rawTag || '').toUpperCase()
  if (!TAG_RE.test(tag)) return res.status(400).json({ error: 'tag must be 3 to 6 letters or digits' })
  if (typeof name !== 'string' || name.trim().length < 3 || name.length > 24)
    return res.status(400).json({ error: 'name must be 3 to 24 characters' })
  if (!ENTRIES.has(entry)) return res.status(400).json({ error: 'bad entry mode' })
  const crest = validateCrest(rawCrest)
  if (!crest) return res.status(400).json({ error: 'bad crest' })

  const lat = Number(cap?.[0]), lon = Number(cap?.[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return res.status(400).json({ error: 'pick a capital on the globe' })

  if (db.prepare('SELECT 1 FROM clans WHERE id = ?').get(tag.toLowerCase()))
    return res.status(409).json({ error: `tag ${tag} is taken` })

  // The capital must stand on open ground.
  const under = db.prepare(
    'SELECT id, clan_id FROM tiles WHERE ? BETWEEN lat - d_lat / 2 AND lat + d_lat / 2 AND ? BETWEEN lon - d_lon / 2 AND lon + d_lon / 2'
  ).get(lat, lon)
  if (!under) return res.status(400).json({ error: 'capital is off the map' })
  if (under.clan_id) return res.status(409).json({ error: 'that ground is already claimed' })

  const id = tag.toLowerCase()
  const paint = PAINTS[db.prepare('SELECT COUNT(*) AS n FROM clans').get().n % PAINTS.length]

  db.exec('BEGIN')
  try {
    db.prepare(`INSERT INTO clans (id, tag, name, entry, region, lang, crest, paint, cap_lat, cap_lon, founded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, tag, name.trim(), entry, String(region || 'Worldwide').slice(0, 40), String(lang || 'English').slice(0, 24),
        JSON.stringify(crest), paint, lat, lon, now())
    db.prepare('INSERT INTO members (address, clan_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(req.address, id, 'leader', now())
    const granted = grantTiles(id, landFor(1), lat, lon)
    if (granted === 0) throw new Error('no free land left')
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return res.status(409).json({ error: String(e.message || e) })
  }

  logEvent('clan', tag, `${tag} was founded and planted its capital`)
  broadcast()
  res.json({ clan: clanRow(db.prepare('SELECT * FROM clans WHERE id = ?').get(id)) })
})

app.post('/api/clans/:id/join', auth, (req, res) => {
  const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(req.params.id)
  if (!clan) return res.status(404).json({ error: 'no such clan' })
  if (db.prepare('SELECT 1 FROM members WHERE address = ?').get(req.address))
    return res.status(409).json({ error: 'you already belong to a clan' })
  const count = db.prepare('SELECT COUNT(*) AS n FROM members WHERE clan_id = ?').get(clan.id).n
  if (count >= CLAN_MAX) return res.status(409).json({ error: 'clan is full' })

  /* A private clan collects a request instead; its leader decides. */
  if (clan.entry !== 'public') {
    db.prepare('INSERT OR REPLACE INTO requests (clan_id, address, created_at) VALUES (?, ?, ?)')
      .run(clan.id, req.address, now())
    logEvent('request', clan.tag, `a wallet asked to join ${clan.tag}`)
    broadcast()
    return res.json({ requested: true })
  }

  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO members (address, clan_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(req.address, clan.id, 'member', now())
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    return res.status(409).json({ error: String(e.message || e) })
  }
  reconcileLand(clan.id)
  addXp(clan.id, 10)
  logEvent('join', clan.tag, `a wallet joined ${clan.tag}, land now ${landFor(count + 1)} tiles`)
  broadcast()
  res.json({ joined: true })
})

app.post('/api/clans/:id/accept', auth, (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || me.clan_id !== req.params.id || !['leader', 'coleader', 'elder'].includes(me.role))
    return res.status(403).json({ error: 'elders and up only' })
  const target = String(req.body?.address || '')
  const pending = db.prepare('SELECT 1 FROM requests WHERE clan_id = ? AND address = ?').get(me.clan_id, target)
  if (!pending) return res.status(404).json({ error: 'no such request' })
  if (db.prepare('SELECT 1 FROM members WHERE address = ?').get(target))
    return res.status(409).json({ error: 'that wallet already belongs to a clan' })

  db.prepare('INSERT INTO members (address, clan_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(target, me.clan_id, 'member', now())
  db.prepare('DELETE FROM requests WHERE clan_id = ? AND address = ?').run(me.clan_id, target)
  reconcileLand(me.clan_id)
  addXp(me.clan_id, 10)
  const clan = db.prepare('SELECT tag FROM clans WHERE id = ?').get(me.clan_id)
  logEvent('join', clan.tag, `${clan.tag} accepted a new wallet`)
  broadcast()
  res.json({ ok: true })
})

app.post('/api/clans/:id/decline', auth, (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || me.clan_id !== req.params.id || !['leader', 'coleader', 'elder'].includes(me.role))
    return res.status(403).json({ error: 'elders and up only' })
  const target = String(req.body?.address || '')
  const gone = db.prepare('DELETE FROM requests WHERE clan_id = ? AND address = ?').run(me.clan_id, target)
  if (!gone.changes) return res.status(404).json({ error: 'no such request' })
  broadcast()
  res.json({ ok: true })
})

/* Roles. A leader hands out ranks; only a leader can pass the banner on. */
const RANKS = new Set(['coleader', 'elder', 'member'])
app.post('/api/clans/:id/role', auth, (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || me.clan_id !== req.params.id || me.role !== 'leader')
    return res.status(403).json({ error: 'leader only' })
  const target = String(req.body?.address || '')
  const role = String(req.body?.role || '')
  if (target === req.address) return res.status(400).json({ error: 'you already lead this clan' })
  const them = db.prepare('SELECT * FROM members WHERE address = ? AND clan_id = ?').get(target, me.clan_id)
  if (!them) return res.status(404).json({ error: 'not in your clan' })

  if (role === 'leader') {
    db.prepare('UPDATE members SET role = ? WHERE address = ?').run('leader', target)
    db.prepare('UPDATE members SET role = ? WHERE address = ?').run('coleader', req.address)
  } else if (RANKS.has(role)) {
    db.prepare('UPDATE members SET role = ? WHERE address = ?').run(role, target)
  } else {
    return res.status(400).json({ error: 'bad role' })
  }
  broadcast()
  res.json({ ok: true })
})

app.post('/api/clans/:id/leave', auth, (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || me.clan_id !== req.params.id) return res.status(404).json({ error: 'not in that clan' })
  const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(me.clan_id)
  const others = db.prepare('SELECT COUNT(*) AS n FROM members WHERE clan_id = ?').get(me.clan_id).n - 1

  db.prepare('DELETE FROM members WHERE address = ?').run(req.address)
  if (me.role === 'leader' && others > 0) {
    const next = db.prepare('SELECT address FROM members WHERE clan_id = ? ORDER BY joined_at LIMIT 1').get(me.clan_id)
    db.prepare('UPDATE members SET role = ? WHERE address = ?').run('leader', next.address)
  }
  if (others === 0) {
    // The banner falls: the land goes back to the world.
    db.prepare('UPDATE tiles SET clan_id = NULL, taken_at = NULL WHERE clan_id = ?').run(me.clan_id)
    db.prepare('DELETE FROM clans WHERE id = ?').run(me.clan_id)
    logEvent('clan', clan.tag, `${clan.tag} disbanded, its land is open again`)
  } else {
    reconcileLand(me.clan_id)
    logEvent('leave', clan.tag, `a wallet left ${clan.tag}`)
  }
  broadcast()
  res.json({ ok: true })
})

/* A clan coin is only real once the chain says so: the caller hands us the
   launch transaction, we read the receipt, and we check the Pons factory
   named that same wallet as the deployer. Nothing is taken on trust. */
app.post('/api/clans/:id/coin', auth, async (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || me.clan_id !== req.params.id || me.role !== 'leader')
    return res.status(403).json({ error: 'leader only' })

  const clan = db.prepare('SELECT * FROM clans WHERE id = ?').get(me.clan_id)
  if (clan.coin_addr) return res.status(409).json({ error: 'this clan already has a coin' })

  const txHash = String(req.body?.txHash || '')
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return res.status(400).json({ error: 'bad transaction hash' })

  let launch
  try {
    launch = await verifyLaunch(txHash, req.address)
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) })
  }

  db.prepare('UPDATE clans SET coin_sym = ?, coin_addr = ?, coin_curve = ?, coin_tx = ? WHERE id = ?')
    .run(launch.symbol || clan.tag, launch.token, launch.curve, txHash, clan.id)
  logEvent('coin', clan.tag, `${clan.tag} launched $${launch.symbol || clan.tag} on Pons`)
  broadcast()
  res.json({ ok: true, token: launch.token, curve: launch.curve })
})

/* ------------------------------------------------------------------
   Wars
   ------------------------------------------------------------------ */
app.post('/api/wars', auth, async (req, res) => {
  const me = db.prepare('SELECT * FROM members WHERE address = ?').get(req.address)
  if (!me || !['leader', 'coleader'].includes(me.role))
    return res.status(403).json({ error: 'leader or co leader only' })
  const target = String(req.body?.target || '')
  if (target === me.clan_id) return res.status(400).json({ error: 'you cannot war yourself' })
  const b = db.prepare('SELECT * FROM clans WHERE id = ?').get(target)
  if (!b) return res.status(404).json({ error: 'no such clan' })

  const busy = db.prepare(
    'SELECT 1 FROM wars WHERE settled_at IS NULL AND (a_id = ? OR b_id = ? OR a_id = ? OR b_id = ?)'
  ).get(me.clan_id, me.clan_id, target, target)
  if (busy) return res.status(409).json({ error: 'one of the two is already at war' })

  const hours = Math.min(48, Math.max(1, Number(req.body?.hours) || 24))
  const heldByB = db.prepare('SELECT COUNT(*) AS n FROM tiles WHERE clan_id = ?').get(target).n
  const id = newId()
  let startBlock = null
  try { startBlock = Number(await head()) } catch { /* scored from first scan instead */ }
  db.prepare(`INSERT INTO wars (id, a_id, b_id, stake, started_at, ends_at, start_block, scan_block)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, me.clan_id, target, Math.floor(heldByB / 5), now(), now() + hours * 3600 * 1000, startBlock, startBlock)
  const a = db.prepare('SELECT tag FROM clans WHERE id = ?').get(me.clan_id)
  logEvent('war', a.tag, `${a.tag} declared war on ${b.tag} for ${hours}h`)
  broadcast()
  res.json({ id })
})

/* ------------------------------------------------------------------
   Bounties
   ------------------------------------------------------------------ */
const KINDS = new Set(['Recruiting', 'Crest art', 'Trading', 'Open call', 'Research'])

app.post('/api/bounties', auth, (req, res) => {
  const { kind, title, reward } = req.body || {}
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'bad kind' })
  if (typeof title !== 'string' || title.trim().length < 8 || title.length > 160)
    return res.status(400).json({ error: 'title must be 8 to 160 characters' })
  const value = Number(reward)
  if (!Number.isFinite(value) || value <= 0 || value > 100) return res.status(400).json({ error: 'bad reward' })
  const me = db.prepare('SELECT clan_id FROM members WHERE address = ?').get(req.address)
  const id = newId()
  db.prepare('INSERT INTO bounties (id, kind, title, reward, clan_id, by_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, kind, title.trim(), value, me?.clan_id ?? null, req.address, now())
  logEvent('bounty', me?.clan_id?.toUpperCase() ?? null, `a ${value} ETH bounty was posted`)
  broadcast()
  res.json({ id })
})

app.post('/api/bounties/:id/claim', auth, (req, res) => {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'no such bounty' })
  if (b.state !== 'open') return res.status(409).json({ error: 'already claimed' })
  if (b.by_address === req.address) return res.status(400).json({ error: 'you posted this one' })
  db.prepare("UPDATE bounties SET state = 'claimed', claimed_by = ? WHERE id = ?").run(req.address, b.id)
  broadcast()
  res.json({ ok: true })
})

app.post('/api/bounties/:id/release', auth, (req, res) => {
  const b = db.prepare('SELECT * FROM bounties WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'no such bounty' })
  if (b.by_address !== req.address) return res.status(403).json({ error: 'only the poster can close it' })
  db.prepare("UPDATE bounties SET state = 'done' WHERE id = ?").run(b.id)
  logEvent('bounty', null, `a bounty was paid out`)
  broadcast()
  res.json({ ok: true })
})

/* ------------------------------------------------------------------
   In production the same process serves the built front end, so the whole
   game is one command on one port. In dev, Vite proxies /api here instead.
   ------------------------------------------------------------------ */
const DIST = resolve('dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(DIST, 'index.html')))
  console.log('[clans] serving the built front end from dist/')
}

/* ------------------------------------------------------------------
   War scoring. Every tick we walk the new blocks since the last scan and
   add up what each side's wallets actually made on Pons. Scanning forward
   from a cursor keeps each pass small, whatever the chain's block rate.
   ------------------------------------------------------------------ */
let scanning = false
async function scoreLiveWars() {
  if (scanning) return false
  scanning = true
  let changed = false
  try {
    const live = db.prepare('SELECT * FROM wars WHERE settled_at IS NULL').all()
    if (!live.length) return false
    const to = await head()

    for (const w of live) {
      const from = BigInt(w.scan_block ?? w.start_block ?? Number(to))
      if (w.scan_block == null) {
        db.prepare('UPDATE wars SET start_block = COALESCE(start_block, ?), scan_block = ? WHERE id = ?')
          .run(Number(to), Number(to), w.id)
        continue
      }
      if (to <= from) continue

      const side = (clanId) =>
        db.prepare('SELECT address FROM members WHERE clan_id = ?').all(clanId).map((m) => m.address)
      const a = side(w.a_id)
      const b = side(w.b_id)
      const wallets = [...a, ...b]
      if (!wallets.length) {
        db.prepare('UPDATE wars SET scan_block = ? WHERE id = ?').run(Number(to), w.id)
        continue
      }

      const { totals, scannedTo } = await scanTrades(wallets, from, to)
      const sum = (list) => list.reduce((n, addr) => n + (totals.get(addr.toLowerCase()) ?? 0n), 0n)
      const weiA = BigInt(w.wei_a) + sum(a)
      const weiB = BigInt(w.wei_b) + sum(b)

      db.prepare('UPDATE wars SET wei_a = ?, wei_b = ?, score_a = ?, score_b = ?, scan_block = ? WHERE id = ?')
        .run(weiA.toString(), weiB.toString(), toEth(weiA), toEth(weiB), Number(scannedTo), w.id)
      if (weiA !== BigInt(w.wei_a) || weiB !== BigInt(w.wei_b)) changed = true
    }
  } catch (e) {
    console.error('[clans] war scan failed:', e.message)
  } finally {
    scanning = false
  }
  return changed
}

setInterval(async () => {
  const scored = await scoreLiveWars()
  if (settleDueWars() > 0 || scored) broadcast()
}, 15000).unref?.()

app.listen(PORT, () => console.log(`[clans] listening on http://localhost:${PORT}`))
