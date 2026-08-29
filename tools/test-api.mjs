/* End-to-end check against a running API.
   Signs with two real keypairs, founds clans, joins, declares a war and
   asserts both wallets read back the same world. Run: npm run test:api */
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

const API = process.env.API || 'http://localhost:8787'
let failures = 0

function check(label, cond, extra = '') {
  const mark = cond ? 'ok  ' : 'FAIL'
  if (!cond) failures++
  console.log(`${mark} ${label}${extra ? ' — ' + extra : ''}`)
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, json }
}

async function signIn() {
  const account = privateKeyToAccount(generatePrivateKey())
  const { json: n } = await call(`/api/auth/nonce?address=${account.address}`)
  const signature = await account.signMessage({ message: n.message })
  const { json: v, status } = await call('/api/auth/verify', {
    method: 'POST',
    body: { address: account.address, nonce: n.nonce, signature },
  })
  if (status !== 200) throw new Error('sign in failed: ' + JSON.stringify(v))
  return { account, token: v.token, handle: v.handle }
}

const crest = {
  shape: 'heater', field: 'pale', charge: 'bolt',
  ink: '#ff6a00', ink2: '#f4f1ec', ground: '#101216', scale: 1,
}
const stamp = Date.now().toString(36).toUpperCase().slice(-3)

/* The world may already hold clans, so never hard-code a capital: find
   ground nobody has taken and plant there. */
function freeSpot(world, skip = 0) {
  const held = (lat, lon) => world.tiles.some(
    (t) => Math.abs(t.lat - lat) <= t.dLat / 2 && Math.abs(((lon - t.lon + 540) % 360) - 180) <= t.dLon / 2
  )
  let seen = 0
  for (let lat = 60; lat > -60; lat -= 3) {
    for (let lon = -175; lon < 175; lon += 5) {
      if (held(lat, lon)) continue
      if (seen++ < skip) continue
      return [lat, lon]
    }
  }
  throw new Error('the world is full')
}

console.log(`\n--- clans.land api check against ${API} ---\n`)

const alice = await signIn()
const bob = await signIn()
const carol = await signIn()
const dave = await signIn()
const erin = await signIn()
const frank = await signIn()
check('wallets signed in with real signatures', !!alice.token && !!bob.token && !!carol.token)

// A forged signature must not be accepted.
{
  const rogue = privateKeyToAccount(generatePrivateKey())
  const { json: n } = await call(`/api/auth/nonce?address=${rogue.address}`)
  const other = privateKeyToAccount(generatePrivateKey())
  const signature = await other.signMessage({ message: n.message })
  const { status } = await call('/api/auth/verify', {
    method: 'POST', body: { address: rogue.address, nonce: n.nonce, signature },
  })
  check('a signature from the wrong key is rejected', status === 401)
}

const before = (await call('/api/world')).json

// Alice founds a clan on open ground.
const capA = freeSpot(before)
const A = await call('/api/clans', {
  method: 'POST', token: alice.token,
  body: { name: 'Ember Court', tag: 'EM' + stamp, entry: 'public', region: 'Worldwide', lang: 'English', crest, cap: capA },
})
check('alice founded a clan', A.status === 200, A.json.error || A.json.clan?.tag)
const tagA = A.json.clan?.tag
const idA = A.json.clan?.id

check('a new clan starts on 9 tiles (6 banner + 3 for the leader)', A.json.clan?.land === 9, `got ${A.json.clan?.land}`)

// The same tag cannot be taken twice.
{
  const dup = await call('/api/clans', {
    method: 'POST', token: bob.token,
    body: { name: 'Copycat', tag: tagA, entry: 'public', region: 'Worldwide', lang: 'English', crest, cap: freeSpot(before, 120) },
  })
  check('a taken tag is refused', dup.status === 409, dup.json.error)
}

// Nobody can plant a capital on ground that is already held.
{
  const overlap = await call('/api/clans', {
    method: 'POST', token: bob.token,
    body: { name: 'Squatters', tag: 'SQ' + stamp, entry: 'public', region: 'Worldwide', lang: 'English', crest, cap: capA },
  })
  check('a capital on claimed ground is refused', overlap.status === 409, overlap.json.error)
}

// Bob founds his own, on different open ground.
const afterA = (await call('/api/world')).json
const capB = freeSpot(afterA, 60)
const B = await call('/api/clans', {
  method: 'POST', token: bob.token,
  body: { name: 'Nightdesk', tag: 'ND' + stamp, entry: 'public', region: 'Worldwide', lang: 'English', crest, cap: capB },
})
check('bob founded a second clan', B.status === 200, B.json.error || B.json.clan?.tag)
const idB = B.json.clan?.id

// Carol joins Alice; the clan's land must grow by three.
const join = await call(`/api/clans/${idA}/join`, { method: 'POST', token: carol.token })
check('carol joined an open clan', join.status === 200, join.json.error)

// One wallet, one clan.
{
  const twice = await call(`/api/clans/${idB}/join`, { method: 'POST', token: carol.token })
  check('a wallet cannot hold two banners', twice.status === 409, twice.json.error)
}

// Everyone reads the same world.
const worldAnon = (await call('/api/world')).json
const worldAlice = (await call('/api/world', { token: alice.token })).json
check('the world is identical for a signed-in and an anonymous reader',
  JSON.stringify(worldAnon.clans) === JSON.stringify(worldAlice.clans))

const clanA = worldAnon.clans.find((c) => c.id === idA)
check('the clan grew from 9 to 12 tiles after the second member', clanA?.land === 12, `got ${clanA?.land}`)
check('the roster carries a leader and a member', clanA?.roster.length === 2 && clanA.roster[0].role === 'leader')

// Land is exclusive: no tile is held by two clans, and totals line up.
const owners = new Map()
let doubled = 0
for (const t of worldAnon.tiles) {
  if (owners.has(t.id)) doubled++
  owners.set(t.id, t.clan)
}
check('no tile is held twice', doubled === 0)
const sumLand = worldAnon.clans.reduce((n, c) => n + c.land, 0)
check('painted tiles equal the sum of every clan holding', sumLand === worldAnon.tiles.length,
  `${sumLand} vs ${worldAnon.tiles.length}`)
check('the world grew since the start', worldAnon.stats.clans > before.stats.clans)

// A private clan collects requests instead of letting people walk in.
{
  const world = (await call('/api/world')).json
  const P = await call('/api/clans', {
    method: 'POST', token: dave.token,
    body: { name: 'Nightdesk', tag: 'PV' + stamp, entry: 'private', region: 'Worldwide', lang: 'English', crest, cap: freeSpot(world, 200) },
  })
  check('a private clan was founded', P.status === 200, P.json.error)
  const idP = P.json.clan?.id

  const ask = await call(`/api/clans/${idP}/join`, { method: 'POST', token: erin.token })
  check('joining a private clan only asks', ask.status === 200 && ask.json.requested === true, JSON.stringify(ask.json))

  const notYet = (await call('/api/world')).json.clans.find((c) => c.id === idP)
  check('the clan shows one wallet waiting', notYet?.requests?.length === 1, `got ${notYet?.requests?.length}`)
  check('and has not gained a member yet', notYet?.members === 1)

  const outsider = await call(`/api/clans/${idP}/accept`, { method: 'POST', token: bob.token, body: { address: erin.account.address } })
  check('an outsider cannot approve a request', outsider.status === 403, outsider.json.error)

  const yes = await call(`/api/clans/${idP}/accept`, { method: 'POST', token: dave.token, body: { address: erin.account.address } })
  check('the leader approves the request', yes.status === 200, yes.json.error)

  const after = (await call('/api/world')).json.clans.find((c) => c.id === idP)
  check('the approved wallet is in the roster', after?.members === 2, `got ${after?.members}`)
  check('the request is cleared', after?.requests?.length === 0)
  check('approving grew the land by three tiles', after?.land === 12, `got ${after?.land}`)

  // Ranks: only the leader hands them out.
  const notLeader = await call(`/api/clans/${idP}/role`, { method: 'POST', token: erin.token, body: { address: dave.account.address, role: 'member' } })
  check('a member cannot change ranks', notLeader.status === 403, notLeader.json.error)

  const promote = await call(`/api/clans/${idP}/role`, { method: 'POST', token: dave.token, body: { address: erin.account.address, role: 'elder' } })
  check('the leader promotes a member to elder', promote.status === 200, promote.json.error)
  const ranked = (await call('/api/world')).json.clans.find((c) => c.id === idP)
  check('the new rank is stored', ranked?.roster.find((m) => m.address === erin.account.address)?.role === 'elder')

  // Declining a request removes it. Frank has no clan, so his ask is real.
  const ask2 = await call(`/api/clans/${idP}/join`, { method: 'POST', token: frank.token })
  check('a second wallet asked to join', ask2.status === 200 && ask2.json.requested === true, JSON.stringify(ask2.json))
  const waiting = (await call('/api/world')).json.clans.find((c) => c.id === idP)
  check('it is waiting in the queue', waiting?.requests?.length === 1, `got ${waiting?.requests?.length}`)

  const no = await call(`/api/clans/${idP}/decline`, { method: 'POST', token: erin.token, body: { address: frank.account.address } })
  check('an elder can decline a request', no.status === 200, no.json.error)
  const cleared = (await call('/api/world')).json.clans.find((c) => c.id === idP)
  check('a declined request is gone', cleared?.requests?.length === 0)
  check('and the declined wallet did not get in', cleared?.members === 2)
}

// War: only a leader can declare, and it locks both sides.
{
  const bad = await call('/api/wars', { method: 'POST', token: carol.token, body: { target: idB } })
  check('a plain member cannot declare war', bad.status === 403, bad.json.error)

  const war = await call('/api/wars', { method: 'POST', token: alice.token, body: { target: idB, hours: 1 } })
  check('a leader declared war', war.status === 200, war.json.error)

  const again = await call('/api/wars', { method: 'POST', token: alice.token, body: { target: idB, hours: 1 } })
  check('a clan already at war cannot open a second front', again.status === 409, again.json.error)

  const gone = await call(`/api/wars/${war.json.id}/score`, { method: 'POST', token: alice.token, body: { score: 999 } })
  check('scores cannot be typed in any more', gone.status === 404, `HTTP ${gone.status}`)

  const w = (await call('/api/world')).json.wars.find((x) => x.id === war.json.id)
  check('a war records the block it started at', typeof w?.startBlock === 'number', `got ${w?.startBlock}`)
}

// Bounties
{
  const posted = await call('/api/bounties', {
    method: 'POST', token: alice.token,
    body: { kind: 'Recruiting', title: 'Bring three wallets with positive 30 day PnL into the clan.', reward: 0.04 },
  })
  check('a bounty was posted', posted.status === 200, posted.json.error)

  const mine = await call(`/api/bounties/${posted.json.id}/claim`, { method: 'POST', token: alice.token })
  check('you cannot claim your own bounty', mine.status === 400, mine.json.error)

  const claimed = await call(`/api/bounties/${posted.json.id}/claim`, { method: 'POST', token: bob.token })
  check('somebody else can claim it', claimed.status === 200, claimed.json.error)
}

// Writing without a session must fail.
{
  const anon = await call('/api/clans', {
    method: 'POST',
    body: { name: 'Ghosts', tag: 'GH' + stamp, entry: 'public', region: 'Worldwide', lang: 'English', crest, cap: capA },
  })
  check('an unsigned request cannot change the world', anon.status === 401)
}

// Leaving hands the land back.
{
  const leave = await call(`/api/clans/${idB}/leave`, { method: 'POST', token: bob.token })
  check('bob left, disbanding his one wallet clan', leave.status === 200, leave.json.error)
  const after = (await call('/api/world')).json
  check('a disbanded clan releases its land', !after.clans.some((c) => c.id === idB))
  check('released tiles are open again', !after.tiles.some((t) => t.clan === idB))
}

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' check(s) failed'}\n`)
process.exit(failures === 0 ? 0 : 1)
