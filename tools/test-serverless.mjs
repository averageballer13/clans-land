/* Runs the app the way a serverless platform does: no long-lived process, no
   background timer, no event stream. Proves the world still works when every
   request may land on a fresh instance. */
process.env.SERVERLESS = '1'
const { default: app } = await import('../server/app.js')
const { migrate } = await import('../server/db.js')
await migrate()

let failures = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

const get = async (path) => {
  const res = await fetch(base + path)
  return { status: res.status, json: await res.json().catch(() => null) }
}

console.log('\n--- clans.team serverless check ---\n')

const health = await get('/api/health')
check('health answers', health.status === 200, JSON.stringify(health.json))
check('it tells the browser not to expect a stream', health.json?.stream === false)

const stream = await get('/api/stream')
check('the stream endpoint refuses instead of hanging', stream.status === 501, stream.json?.error)

const version = await get('/api/version')
check('a cheap version endpoint answers', version.status === 200 && typeof version.json?.v === 'number',
  `v=${version.json?.v}`)

const world = await get('/api/world')
check('the world loads', world.status === 200, JSON.stringify(world.json?.stats))
check('the map is the full grid', world.json?.stats?.totalTiles === 1200, `got ${world.json?.stats?.totalTiles}`)

const world2 = await get('/api/world')
check('two reads agree', JSON.stringify(world.json.clans) === JSON.stringify(world2.json.clans))

server.close()
console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' check(s) failed'}\n`)
process.exit(failures === 0 ? 0 : 1)
