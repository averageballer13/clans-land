/* The game server.

   Exported as an app rather than started here, so the same routes run as a
   long-lived process locally and as a serverless function in production.
   Nothing is kept in memory between requests: the world version, the chain
   scan cursor and every lock live in the database, because on a serverless
   platform each request may land on a different instance. */

import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { verifyMessage, isAddress, getAddress } from 'viem'
import {
  migrate, one, many, run, tx, now, logEvent, bumpVersion, getMeta, setMeta,
} from './db.js'
import {
  readWorld, grantTiles, reconcileLand, settleDueWars, newId, tileAt,
  landFor, addXp, PAINTS, CLAN_MAX,
} from './world.js'
import { verifyLaunch, scanTrades, head, toEth, CHAIN_ID } from './chain.js'

export const SERVERLESS = Boolean(process.env.VERCEL || process.env.SERVERLESS)

const app = express()
app.use(express.json({ limit: '64kb' }))

/* The site and the API can live on different hosts. CLANS_ORIGINS is a strict
   allow-list; anything not on it gets no CORS headers at all. */
const ORIGINS = (process.env.CLANS_ORIGINS || '')
  .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)

app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
    res.set('Access-Control-Allow-Headers', 'authorization, content-type')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin ? 204 : 405)
  next()
})

/* The schema is created on the first request that needs it. */
let migrated = false
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  try {
    if (!migrated) { await migrate(); migrated = true }
    next()
  } catch (e) {
    next(e)
  }
})

const fail = (res, code, error) => res.status(code).json({ error })

/* ------------------------------------------------------------------
   Health. `stream` tells the browser whether an event stream is worth
   opening, or whether it should just poll.
   ------------------------------------------------------------------ */
app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, chain: CHAIN_ID, stream: !SERVERLESS, version: Number(await getMeta('version', '1')) })
})

/* A one-field read so a browser can ask "did anything change?" cheaply. */
app.get('/api/version', async (_req, res) => {
  res.json({ v: Number(await getMeta('version', '1')) })
})

/* ------------------------------------------------------------------
   Live updates, for the long-lived process only.
   ------------------------------------------------------------------ */
const streams = new Set()
export async function broadcast() {
  const v = await bumpVersion()
  const line = `data: ${JSON.stringify({ v })}\n\n`
  for (const res of streams) { try { res.write(line) } catch { /* dropped */ } }
  return v
}

app.get('/api/stream', async (req, res) => {
  if (SERVERLESS) return fail(res, 501, 'this deployment does not hold streams open; poll /api/version')
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  res.flushHeaders?.()
  res.write(`data: ${JSON.stringify({ v: Number(await getMeta('version', '1')) })}\n\n`)
  streams.add(res)
  const beat = setInterval(() => { try { res.write(': ping\n\n') } catch { /* dropped */ } }, 25000)
  req.on('close', () => { clearInterval(beat); streams.delete(res) })
})

/* ------------------------------------------------------------------
   Auth: prove you hold the wallet by signing a nonce. No password, no
   gas, no custody.
   ------------------------------------------------------------------ */
const HANDLE_A = ['iron', 'ash', 'ember', 'null', 'grim', 'vault', 'wire', 'onyx', 'flint', 'quill', 'sable', 'ridge', 'cobalt', 'hollow']
const HANDLE_B = ['baron', 'sentry', 'ward', 'runner', 'smith', 'hand', 'clerk', 'signal', 'wolf', 'anchor', 'lantern', 'archer']
function handleFor(address) {
  const n = parseInt(address.slice(2, 10), 16)
  return `${HANDLE_A[n % HANDLE_A.length]}${HANDLE_B[(n >> 4) % HANDLE_B.length]}${(n >> 8) % 90 + 10}`
}

const signInMessage = (address, nonce) =>
  `clans.team wants you to sign in with your wallet.\n\n` +
  `Address: ${address}\n` +
  `Nonce: ${nonce}\n\n` +
  `Signing costs nothing and grants no access to your funds.`

app.get('/api/auth/nonce', async (req, res) => {
  const raw = String(req.query.address || '')
  if (!isAddress(raw)) return fail(res, 400, 'bad address')
  const address = getAddress(raw)
  const nonce = randomBytes(16).toString('hex')
  await run('INSERT INTO nonces (nonce, address, created_at) VALUES ($1, $2, $3)', [nonce, address, now()])
  await run('DELETE FROM nonces WHERE created_at < $1', [now() - 10 * 60 * 1000])
  res.json({ nonce, message: signInMessage(address, nonce) })
})

app.post('/api/auth/verify', async (req, res) => {
  const { address: raw, nonce, signature } = req.body || {}
  if (!isAddress(raw || '')) return fail(res, 400, 'bad address')
  const address = getAddress(raw)
  const row = await one('SELECT * FROM nonces WHERE nonce = $1 AND address = $2', [nonce, address])
  if (!row) return fail(res, 400, 'unknown or expired nonce')

  let ok = false
  try {
    ok = await verifyMessage({ address, message: signInMessage(address, nonce), signature })
  } catch { ok = false }
  await run('DELETE FROM nonces WHERE nonce = $1', [nonce])
  if (!ok) return fail(res, 401, 'signature does not match')

  const existing = await one('SELECT * FROM wallets WHERE address = $1', [address])
  if (existing) await run('UPDATE wallets SET seen_at = $1 WHERE address = $2', [now(), address])
  else {
    await run('INSERT INTO wallets (address, handle, created_at, seen_at) VALUES ($1, $2, $3, $4)',
      [address, handleFor(address), now(), now()])
    await broadcast()
  }

  const token = randomBytes(24).toString('hex')
  await run('INSERT INTO sessions (token, address, created_at) VALUES ($1, $2, $3)', [token, address, now()])
  const w = await one('SELECT handle FROM wallets WHERE address = $1', [address])
  res.json({ token, address, handle: w.handle })
})

async function auth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '')
  const s = token && (await one('SELECT * FROM sessions WHERE token = $1', [token]))
  if (!s) return fail(res, 401, 'sign in first')
  req.address = s.address
  next()
}

app.post('/api/auth/logout', auth, async (req, res) => {
  await run('DELETE FROM sessions WHERE token = $1', [(req.get('authorization') || '').replace(/^Bearer /, '')])
  res.json({ ok: true })
})

/* ------------------------------------------------------------------
   World
   ------------------------------------------------------------------ */
app.get('/api/world', async (_req, res) => {
  await settleDueWars()
  await maybeScanWars()
  const world = await readWorld()
  res.json({ v: Number(await getMeta('version', '1')), ...world })
})

app.get('/api/me', auth, async (req, res) => {
  const [w, m] = await Promise.all([
    one('SELECT * FROM wallets WHERE address = $1', [req.address]),
    one('SELECT * FROM members WHERE address = $1', [req.address]),
  ])
  res.json({ address: req.address, handle: w?.handle, clan: m ? { id: m.clan_id, role: m.role } : null })
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

app.post('/api/clans', auth, async (req, res) => {
  if (await one('SELECT 1 FROM members WHERE address = $1', [req.address]))
    return fail(res, 409, 'you already belong to a clan')

  const { name, tag: rawTag, entry, region, lang, crest: rawCrest, cap } = req.body || {}
  const tag = String(rawTag || '').toUpperCase()
  if (!TAG_RE.test(tag)) return fail(res, 400, 'tag must be 3 to 6 letters or digits')
  if (typeof name !== 'string' || name.trim().length < 3 || name.length > 24)
    return fail(res, 400, 'name must be 3 to 24 characters')
  if (!ENTRIES.has(entry)) return fail(res, 400, 'bad entry mode')
  const crest = validateCrest(rawCrest)
  if (!crest) return fail(res, 400, 'bad crest')

  const lat = Number(cap?.[0]), lon = Number(cap?.[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return fail(res, 400, 'pick a capital on the globe')

  const id = tag.toLowerCase()
  if (await one('SELECT 1 FROM clans WHERE id = $1', [id])) return fail(res, 409, `tag ${tag} is taken`)

  const under = await tileAt(lat, lon)
  if (!under) return fail(res, 400, 'capital is off the map')
  if (under.clan_id) return fail(res, 409, 'that ground is already claimed')

  const count = Number((await one('SELECT COUNT(*)::int AS n FROM clans')).n)
  const paint = PAINTS[count % PAINTS.length]

  try {
    await tx(async () => {
      await run(
        `INSERT INTO clans (id, tag, name, entry, region, lang, crest, paint, cap_lat, cap_lon, founded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, tag, name.trim(), entry, String(region || 'Worldwide').slice(0, 40),
          String(lang || 'English').slice(0, 24), JSON.stringify(crest), paint, lat, lon, now()]
      )
      await run('INSERT INTO members (address, clan_id, role, joined_at) VALUES ($1, $2, $3, $4)',
        [req.address, id, 'leader', now()])
      const granted = await grantTiles(id, landFor(1), lat, lon)
      if (granted === 0) throw new Error('no free land left')
    })
  } catch (e) {
    return fail(res, 409, String(e.message || e))
  }

  await logEvent('clan', tag, `${tag} was founded and planted its capital`)
  await broadcast()
  const world = await readWorld()
  res.json({ clan: world.clans.find((c) => c.id === id) })
})

app.post('/api/clans/:id/join', auth, async (req, res) => {
  const clan = await one('SELECT * FROM clans WHERE id = $1', [req.params.id])
  if (!clan) return fail(res, 404, 'no such clan')
  if (await one('SELECT 1 FROM members WHERE address = $1', [req.address]))
    return fail(res, 409, 'you already belong to a clan')
  const count = Number((await one('SELECT COUNT(*)::int AS n FROM members WHERE clan_id = $1', [clan.id])).n)
  if (count >= CLAN_MAX) return fail(res, 409, 'clan is full')

  /* A private clan collects a request instead; its leaders decide. */
  if (clan.entry !== 'public') {
    await run(
      `INSERT INTO requests (clan_id, address, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (clan_id, address) DO UPDATE SET created_at = EXCLUDED.created_at`,
      [clan.id, req.address, now()]
    )
    await logEvent('request', clan.tag, `a wallet asked to join ${clan.tag}`)
    await broadcast()
    return res.json({ requested: true })
  }

  await run('INSERT INTO members (address, clan_id, role, joined_at) VALUES ($1, $2, $3, $4)',
    [req.address, clan.id, 'member', now()])
  await reconcileLand(clan.id)
  await addXp(clan.id, 10)
  await logEvent('join', clan.tag, `a wallet joined ${clan.tag}, land now ${landFor(count + 1)} tiles`)
  await broadcast()
  res.json({ joined: true })
})

async function canManage(address, clanId) {
  const me = await one('SELECT * FROM members WHERE address = $1', [address])
  return me && me.clan_id === clanId && ['leader', 'coleader', 'elder'].includes(me.role) ? me : null
}

app.post('/api/clans/:id/accept', auth, async (req, res) => {
  const me = await canManage(req.address, req.params.id)
  if (!me) return fail(res, 403, 'elders and up only')
  const target = String(req.body?.address || '')
  const pending = await one('SELECT 1 FROM requests WHERE clan_id = $1 AND address = $2', [me.clan_id, target])
  if (!pending) return fail(res, 404, 'no such request')
  if (await one('SELECT 1 FROM members WHERE address = $1', [target]))
    return fail(res, 409, 'that wallet already belongs to a clan')

  await run('INSERT INTO members (address, clan_id, role, joined_at) VALUES ($1, $2, $3, $4)',
    [target, me.clan_id, 'member', now()])
  await run('DELETE FROM requests WHERE clan_id = $1 AND address = $2', [me.clan_id, target])
  await reconcileLand(me.clan_id)
  await addXp(me.clan_id, 10)
  const clan = await one('SELECT tag FROM clans WHERE id = $1', [me.clan_id])
  await logEvent('join', clan.tag, `${clan.tag} accepted a new wallet`)
  await broadcast()
  res.json({ ok: true })
})

app.post('/api/clans/:id/decline', auth, async (req, res) => {
  const me = await canManage(req.address, req.params.id)
  if (!me) return fail(res, 403, 'elders and up only')
  const gone = await run('DELETE FROM requests WHERE clan_id = $1 AND address = $2',
    [me.clan_id, String(req.body?.address || '')])
  if (!gone) return fail(res, 404, 'no such request')
  await broadcast()
  res.json({ ok: true })
})

/* Ranks. Only a leader hands them out, and only a leader can pass the banner. */
const RANKS = new Set(['coleader', 'elder', 'member'])
app.post('/api/clans/:id/role', auth, async (req, res) => {
  const me = await one('SELECT * FROM members WHERE address = $1', [req.address])
  if (!me || me.clan_id !== req.params.id || me.role !== 'leader') return fail(res, 403, 'leader only')
  const target = String(req.body?.address || '')
  const role = String(req.body?.role || '')
  if (target === req.address) return fail(res, 400, 'you already lead this clan')
  const them = await one('SELECT * FROM members WHERE address = $1 AND clan_id = $2', [target, me.clan_id])
  if (!them) return fail(res, 404, 'not in your clan')

  if (role === 'leader') {
    await run('UPDATE members SET role = $1 WHERE address = $2', ['leader', target])
    await run('UPDATE members SET role = $1 WHERE address = $2', ['coleader', req.address])
  } else if (RANKS.has(role)) {
    await run('UPDATE members SET role = $1 WHERE address = $2', [role, target])
  } else {
    return fail(res, 400, 'bad role')
  }
  await broadcast()
  res.json({ ok: true })
})

app.post('/api/clans/:id/leave', auth, async (req, res) => {
  const me = await one('SELECT * FROM members WHERE address = $1', [req.address])
  if (!me || me.clan_id !== req.params.id) return fail(res, 404, 'not in that clan')
  const clan = await one('SELECT * FROM clans WHERE id = $1', [me.clan_id])
  const others = Number((await one('SELECT COUNT(*)::int AS n FROM members WHERE clan_id = $1', [me.clan_id])).n) - 1

  await run('DELETE FROM members WHERE address = $1', [req.address])
  if (me.role === 'leader' && others > 0) {
    const next = await one('SELECT address FROM members WHERE clan_id = $1 ORDER BY joined_at LIMIT 1', [me.clan_id])
    await run('UPDATE members SET role = $1 WHERE address = $2', ['leader', next.address])
  }
  if (others === 0) {
    // The banner falls: the land goes back to the world.
    await run('UPDATE tiles SET clan_id = NULL, taken_at = NULL WHERE clan_id = $1', [me.clan_id])
    await run('DELETE FROM clans WHERE id = $1', [me.clan_id])
    await logEvent('clan', clan.tag, `${clan.tag} disbanded, its land is open again`)
  } else {
    await reconcileLand(me.clan_id)
    await logEvent('leave', clan.tag, `a wallet left ${clan.tag}`)
  }
  await broadcast()
  res.json({ ok: true })
})

/* A clan coin is only real once the chain says so: the caller hands us the
   launch transaction, we read the receipt, and the Pons factory has to name
   that same wallet as the deployer. */
app.post('/api/clans/:id/coin', auth, async (req, res) => {
  const me = await one('SELECT * FROM members WHERE address = $1', [req.address])
  if (!me || me.clan_id !== req.params.id || me.role !== 'leader') return fail(res, 403, 'leader only')

  const clan = await one('SELECT * FROM clans WHERE id = $1', [me.clan_id])
  if (clan.coin_addr) return fail(res, 409, 'this clan already has a coin')

  const txHash = String(req.body?.txHash || '')
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return fail(res, 400, 'bad transaction hash')

  let launch
  try {
    launch = await verifyLaunch(txHash, req.address)
  } catch (e) {
    return fail(res, 400, String(e.message || e))
  }

  await run('UPDATE clans SET coin_sym = $1, coin_addr = $2, coin_curve = $3, coin_tx = $4 WHERE id = $5',
    [launch.symbol || clan.tag, launch.token, launch.curve, txHash, clan.id])
  await logEvent('coin', clan.tag, `${clan.tag} launched $${launch.symbol || clan.tag} on Pons`)
  await broadcast()
  res.json({ ok: true, token: launch.token, curve: launch.curve })
})

/* ------------------------------------------------------------------
   Wars
   ------------------------------------------------------------------ */
app.post('/api/wars', auth, async (req, res) => {
  const me = await one('SELECT * FROM members WHERE address = $1', [req.address])
  if (!me || !['leader', 'coleader'].includes(me.role)) return fail(res, 403, 'leader or co leader only')
  const target = String(req.body?.target || '')
  if (target === me.clan_id) return fail(res, 400, 'you cannot war yourself')
  const b = await one('SELECT * FROM clans WHERE id = $1', [target])
  if (!b) return fail(res, 404, 'no such clan')

  const busy = await one(
    `SELECT 1 FROM wars WHERE settled_at IS NULL
     AND (a_id = $1 OR b_id = $1 OR a_id = $2 OR b_id = $2)`,
    [me.clan_id, target]
  )
  if (busy) return fail(res, 409, 'one of the two is already at war')

  const hours = Math.min(48, Math.max(1, Number(req.body?.hours) || 24))
  const heldByB = Number((await one('SELECT COUNT(*)::int AS n FROM tiles WHERE clan_id = $1', [target])).n)
  const id = newId()
  let startBlock = null
  try { startBlock = Number(await head()) } catch { /* scored from the first scan instead */ }
  await run(
    `INSERT INTO wars (id, a_id, b_id, stake, started_at, ends_at, start_block, scan_block)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, me.clan_id, target, Math.floor(heldByB / 5), now(), now() + hours * 3600 * 1000, startBlock]
  )
  const a = await one('SELECT tag FROM clans WHERE id = $1', [me.clan_id])
  await logEvent('war', a.tag, `${a.tag} declared war on ${b.tag} for ${hours}h`)
  await broadcast()
  res.json({ id })
})

/* ------------------------------------------------------------------
   Bounties
   ------------------------------------------------------------------ */
const KINDS = new Set(['Recruiting', 'Crest art', 'Trading', 'Open call', 'Research'])

app.post('/api/bounties', auth, async (req, res) => {
  const { kind, title, reward } = req.body || {}
  if (!KINDS.has(kind)) return fail(res, 400, 'bad kind')
  if (typeof title !== 'string' || title.trim().length < 8 || title.length > 160)
    return fail(res, 400, 'title must be 8 to 160 characters')
  const value = Number(reward)
  if (!Number.isFinite(value) || value <= 0 || value > 100) return fail(res, 400, 'bad reward')
  const me = await one('SELECT clan_id FROM members WHERE address = $1', [req.address])
  const id = newId()
  await run(
    'INSERT INTO bounties (id, kind, title, reward, clan_id, by_address, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, kind, title.trim(), value, me?.clan_id ?? null, req.address, now()]
  )
  await logEvent('bounty', me?.clan_id?.toUpperCase() ?? null, `a ${value} ETH bounty was posted`)
  await broadcast()
  res.json({ id })
})

app.post('/api/bounties/:id/claim', auth, async (req, res) => {
  const b = await one('SELECT * FROM bounties WHERE id = $1', [req.params.id])
  if (!b) return fail(res, 404, 'no such bounty')
  if (b.state !== 'open') return fail(res, 409, 'already claimed')
  if (b.by_address === req.address) return fail(res, 400, 'you posted this one')
  await run("UPDATE bounties SET state = 'claimed', claimed_by = $1 WHERE id = $2", [req.address, b.id])
  await broadcast()
  res.json({ ok: true })
})

app.post('/api/bounties/:id/release', auth, async (req, res) => {
  const b = await one('SELECT * FROM bounties WHERE id = $1', [req.params.id])
  if (!b) return fail(res, 404, 'no such bounty')
  if (b.by_address !== req.address) return fail(res, 403, 'only the poster can close it')
  await run("UPDATE bounties SET state = 'done' WHERE id = $1", [b.id])
  await logEvent('bounty', null, 'a bounty was paid out')
  await broadcast()
  res.json({ ok: true })
})

/* ------------------------------------------------------------------
   War scoring.

   Walks the new blocks since each war's cursor and adds up what the
   roster actually made on Pons. There is no background worker on a
   serverless platform, so this runs off the back of requests, behind a
   lock in the database so only one instance scans at a time.
   ------------------------------------------------------------------ */
const SCAN_EVERY = Number(process.env.SCAN_EVERY_MS || 15000)
const SCAN_LOCK_MS = 60000

export async function maybeScanWars() {
  const last = Number(await getMeta('scan_at', '0'))
  const lockedUntil = Number(await getMeta('scan_lock', '0'))
  if (now() - last < SCAN_EVERY || now() < lockedUntil) return false
  await setMeta('scan_lock', now() + SCAN_LOCK_MS)
  try {
    return await scoreLiveWars()
  } finally {
    await setMeta('scan_at', now())
    await setMeta('scan_lock', '0')
  }
}

export async function scoreLiveWars() {
  let changed = false
  try {
    const live = await many('SELECT * FROM wars WHERE settled_at IS NULL')
    if (!live.length) return false
    const to = await head()

    for (const w of live) {
      if (w.scan_block == null) {
        await run('UPDATE wars SET start_block = COALESCE(start_block, $1), scan_block = $1 WHERE id = $2',
          [Number(to), w.id])
        continue
      }
      const from = BigInt(w.scan_block)
      if (to <= from) continue

      const side = async (clanId) =>
        (await many('SELECT address FROM members WHERE clan_id = $1', [clanId])).map((m) => m.address)
      const a = await side(w.a_id)
      const b = await side(w.b_id)
      const wallets = [...a, ...b]
      if (!wallets.length) {
        await run('UPDATE wars SET scan_block = $1 WHERE id = $2', [Number(to), w.id])
        continue
      }

      const { totals, scannedTo } = await scanTrades(wallets, from, to)
      const sum = (list) => list.reduce((n, addr) => n + (totals.get(addr.toLowerCase()) ?? 0n), 0n)
      const weiA = BigInt(w.wei_a) + sum(a)
      const weiB = BigInt(w.wei_b) + sum(b)

      await run(
        'UPDATE wars SET wei_a = $1, wei_b = $2, score_a = $3, score_b = $4, scan_block = $5 WHERE id = $6',
        [weiA.toString(), weiB.toString(), toEth(weiA), toEth(weiB), Number(scannedTo), w.id]
      )
      if (weiA !== BigInt(w.wei_a) || weiB !== BigInt(w.wei_b)) changed = true
    }
  } catch (e) {
    console.error('[clans] war scan failed:', e.message)
  }
  return changed
}

/* ------------------------------------------------------------------
   The built site, when this process is the one serving it.
   ------------------------------------------------------------------ */
const DIST = resolve('dist')
if (!SERVERLESS && existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(DIST, 'index.html')))
}

app.use((err, _req, res, _next) => {
  console.error('[clans]', err)
  res.status(500).json({ error: 'the game server hit an error' })
})

export default app
