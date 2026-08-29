/* Founds a clan from the command line with a real signature.
   Useful for seeding a world, and for proving that a change made by one
   client shows up in every other client.

   node tools/found-clan.mjs "Ember Court" EMBR 48.86 2.35 [open|request|invite]
*/
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { randomCrest } from '../src/lib/crest.js'

const API = process.env.API || 'http://localhost:8787'
const [name, tag, lat, lon, entry = 'open'] = process.argv.slice(2)

if (!name || !tag || lat === undefined || lon === undefined) {
  console.error('usage: node tools/found-clan.mjs "<name>" <TAG> <lat> <lon> [entry]')
  process.exit(1)
}

const call = async (path, opts = {}) => {
  const res = await fetch(API + path, {
    method: opts.body ? 'POST' : 'GET',
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

const key = process.env.PRIVATE_KEY || generatePrivateKey()
const account = privateKeyToAccount(key)

const { nonce, message } = await call(`/api/auth/nonce?address=${account.address}`)
const signature = await account.signMessage({ message })
const { token } = await call('/api/auth/verify', { body: { address: account.address, nonce, signature } })

const { clan } = await call('/api/clans', {
  token,
  body: {
    name, tag: tag.toUpperCase(), entry,
    region: 'Worldwide', lang: 'English',
    crest: randomCrest(tag),
    cap: [Number(lat), Number(lon)],
  },
})

console.log(`founded ${clan.name} [${clan.tag}] — ${clan.land} tiles at ${clan.cap[0]}, ${clan.cap[1]}`)
console.log(`leader wallet ${account.address}`)
if (!process.env.PRIVATE_KEY) console.log(`(throwaway key: ${key})`)
