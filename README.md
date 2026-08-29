# Clans.land

**The World of SocialFi on Robinhood Chain.** Social trading as a competitive game:
wallets form clans, clans take land on one shared globe, clan coins launched on
**Pons** earn the creator rewards, and timed wars settle the rest.

Same product idea and art direction as the original `pfclans.fun`, rebuilt for
Robinhood Chain in a pro black / orange theme.

**It is a real game, not a mockup.** There is a server, a database and a shared
map. You sign in with your wallet, and what you do — founding a clan, planting a
capital, taking tiles, joining, declaring war, posting a bounty — is written to
one world that every other visitor sees, live, without reloading.

**The world ships empty.** No clans, no land taken, no wars, no bounties, no token
deployed. The first clan founded is genuinely the first clan, and it gets first
pick of 1200 tiles.

---

## Running it

```bash
npm install
npm run dev
```

That starts the API on `:8787` and the site on `:5183` (Vite proxies `/api`).
Open http://localhost:5183.

For a real deployment, one process serves everything on one port:

```bash
npm run build
npm start
```

The database is a single SQLite file at `server/data/clans.db` — back it up, and
the world survives restarts. Override the location with `CLANS_DB`, the port with
`PORT`.

To check the whole game logic end to end (real signatures, land allocation,
permissions, wars, bounties) against a running server:

```bash
npm run test:api
```

## How the shared world works

| Piece | What it does |
| --- | --- |
| `server/db.js` | SQLite schema and the 1200-tile grid, generated once and never regenerated so land ownership survives restarts |
| `server/world.js` | Land allocation and release, level curve, war settlement, and the single `readWorld()` shape everyone is served |
| `server/index.js` | Wallet auth, every mutation, and the SSE stream that tells clients to refetch |
| `src/lib/store.jsx` | React context holding the world, the session, and every action |
| `src/lib/wallet.js` | EIP-1193 connect, chain switch/add for Robinhood Chain, `personal_sign` |

**Signing in.** The server hands out a nonce, your wallet signs a plain message,
and the server verifies the signature with viem. No password, no gas, no
transaction, no custody. The address is your identity.

**Land is exclusive.** Tiles live in one table and are handed out inside a
transaction, nearest-to-capital first, so two clans founded at the same instant
can never be given the same ground. A capital cannot be planted on a tile another
clan already holds. Joining widens the border by three tiles, leaving gives them
back, and the last wallet out disbands the clan and releases all of it.

**Wars settle themselves.** A war is one number a side. When the clock runs out
the server settles it: the higher score takes a fifth of the loser's land and
trophies scaled by the margin. A tie holds for the defender.

**Everyone sees the same thing.** Any mutation bumps a version and pushes it down
an `EventSource` stream; clients refetch immediately, and fall back to polling if
the stream cannot be held open.

### What is not wired to the chain yet

War scores are reported by each side rather than read from an indexer, and clan
coins are registered by their Leader rather than discovered automatically. Both
are marked as such in the interface. Everything else — identity, land, membership,
levels, bounties — is real server state.

## The globe

Rendered in three.js from **Natural Earth 1:110m** land, baked at load into a
single equirectangular canvas (`src/globe/earthTexture.js`). Deliberately graphic
rather than cartographic: flat ocean, flat land, one hairline orange coast, a
faint 30° graticule. Nothing on the map competes with the clans.

On top of the sphere: a tight atmospheric rim shader, a hollow radial halo sprite
(a second shader shell peaks at its own limb and reads as a hard ring), 2 600
stars, clan land as a low additive tint plus crisp territory edges, and capital
markers that breathe. Drag to rotate, wheel to zoom, hover a tile — unclaimed
ground reports its coordinates, claimed ground reports its clan. Founding a clan
puts the globe in pick mode so you plant your capital by clicking the map.

## Clan crests

One art direction, eight silhouettes at different proportions — heater, kite,
banner, hex, rondel, lozenge, pennon, tower — crossed with nine field divisions
and twelve charges, all locked to the site palette so the whole set reads as one
system (`src/ui/Crest.jsx`). Charge colour is chosen for contrast against whatever
sits behind it, so nothing ever goes dark on dark. The server validates every
crest against the same vocabulary, so nobody can smuggle in off-palette art.

## Chain and brand

Robinhood Chain mainnet: **chain ID 4663**, ETH for gas, RPC
`rpc.mainnet.chain.robinhood.com`, explorer `robinhoodchain.blockscout.com`. The
wallet sheet will switch or add the network for you.

Everything in `public/brand/` is the real mark, fetched from the vendor:

- `robinhood-feather.svg` — Robinhood Chain, from `cdn.robinhood.com`
- `pons.png` — the Pons launchpad mark
- `wallet/` — MetaMask, Rabby, Coinbase Wallet, WalletConnect

Clans.land is not affiliated with Robinhood Markets, Robinhood Chain, Pons, or any
wallet whose mark appears here. Marks identify their services and belong to their
owners.

## Layout

```
server/
  db.js                schema, tile grid, event log
  world.js             land, levels, war settlement, world shape
  index.js             auth, routes, SSE, static hosting in production
src/
  App.jsx              shell: top bar, menu, panel, hero, ticker, overlays
  lib/brand.js         chain / launchpad / wallet identity
  lib/crest.js         the crest vocabulary, mirrored by server validation
  lib/wallet.js        EIP-1193 connect, chain switch, signing
  lib/store.jsx        world state, session, actions, live updates
  ui/Crest.jsx         crest rendering
  globe/Globe.jsx      three.js scene, controls, picking, land layers
  globe/earthTexture.js  the equirectangular map
  panels/Panels.jsx    every panel section
tools/
  build-earth.mjs      compacts Natural Earth GeoJSON into public/data/earth.json
  test-api.mjs         end-to-end game logic check with real signatures
  found-clan.mjs       found a clan from the command line
  capture-plugin.mjs   dev-only: POST a frame to /__shot to inspect the globe
```
