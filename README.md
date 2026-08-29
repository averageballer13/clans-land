# Clans.team

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

With no `DATABASE_URL` the game runs its own Postgres inside the process against
`server/data/pg`, so there is nothing to install. Point `DATABASE_URL` at a hosted
Postgres and it uses that instead. `PORT` moves the server.

To check the whole game logic end to end (real signatures, land allocation,
permissions, wars, bounties) against a running server:

```bash
npm run test:api
```

And the chain integration, read-only, against Robinhood Chain mainnet:

```bash
npm run test:chain
```

## Putting it online

The site alone is not the game. A static host serves the map and the panels, but
founding a clan, taking land, joining, wars and coins all need the server and its
database. On a static host every `/api/` call returns 404 and the connect sheet
says the game server is not answering.

### On Vercel

The API runs as one serverless function (`api/[...path].js`) that hands every
request to the same Express app the local server runs, and the site is served as
static files. `vercel.json` already wires both.

One thing has to be added by hand: **a database**. A serverless platform keeps no
disk between requests, so the world has to live somewhere else.

1. In the Vercel dashboard open **Storage → Create Database → Postgres**, and
   attach it to the project. That sets `DATABASE_URL` for you.
2. Redeploy.

That is the whole setup. The schema is created on the first request that needs
it, and the 1200-tile grid is generated once and never regenerated, so the map
survives every redeploy.

Two details follow from being serverless, and the code handles both:

- **No event stream.** A function cannot hold a connection open, so
  `/api/health` reports `stream: false` and the browser polls `/api/version`
  instead — one number, and it only refetches the world when that number moves.
- **No background worker.** War scores are scanned off the back of requests
  rather than on a timer, behind a lock in the database so only one instance
  scans at a time.

`npm run test:serverless` runs the app in exactly that mode and checks it.

### On one long-lived host

Anything that runs Node with a disk — Render, Railway, Fly, a VPS — serves the
API and the site from one process on one port, holds event streams open, and
scans the chain on a timer. `render.yaml` and the `Dockerfile` are ready:

```bash
docker build -t clans .
docker run -p 8787:8787 -v clans-world:/data clans
```

With no `DATABASE_URL` the game runs its own Postgres in-process against
`CLANS_DB_DIR`, so mount a volume there or the map resets on redeploy.

### Site here, server there

To keep the site on one host and the API on another, two settings have to match:

| Where | Setting | Value |
| --- | --- | --- |
| the site's build | `VITE_API_URL` | `https://api.clans.team` |
| the server | `CLANS_ORIGINS` | `https://www.clans.team,https://clans.team` |

`CLANS_ORIGINS` is a strict allow-list: an origin that is not on it gets no CORS
headers at all. `GET /api/health` is what a host should watch.

## How the shared world works

| Piece | What it does |
| --- | --- |
| `server/db.js` | Postgres schema and the 1200-tile grid, generated once and never regenerated so land ownership survives restarts |
| `server/world.js` | Land allocation and release, level curve, war settlement, and the single `readWorld()` shape everyone is served |
| `server/app.js` | Wallet auth, every mutation, the event stream, and the lazy chain scan |
| `src/lib/store.jsx` | React context holding the world, the session, and every action |
| `src/lib/wallet.js` | EIP-1193 connect, chain switch/add for Robinhood Chain, `personal_sign` |

**Signing in.** The server hands out a nonce, your wallet signs a plain message,
and the server verifies the signature with viem. No password, no gas, no
transaction, no custody. The address is your identity.

**Public or private.** A clan is one or the other. Public and anyone walks in;
private and the wallet asks, then the Leader, a Co Leader or an Elder approves or
declines from the roster tab. Only the Leader hands out ranks, and handing the
clan over demotes the old Leader to Co Leader in the same move.

**Connecting.** Wallets are discovered over EIP-6963, so anything installed shows
up with its own name and icon and an "Installed" badge — Rabby, Phantom, Brave,
MetaMask, Trust and the rest. Wallets that are not installed are still listed with
a link to get them, and there is a search box. Both terms boxes have to be ticked
before a connect button unlocks. A browser stuck on `window.ethereum` alone still
works.

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

## On chain

Two things are read from Robinhood Chain itself, not typed in by anyone.

**Launching a clan coin.** The Leader fills in a logo, a description and links,
and the browser builds a `launchToken` call to the Pons V2 factory at
`0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`. The economics pin is read
immediately before signing, and the whole call is simulated first — if it would
revert, the wallet never opens, so a doomed launch costs nothing. The user signs
it and pays the 0.0005 ETH fee plus gas; creator fees go to their own wallet.
The server then pulls the receipt, finds the `TokenLaunched` event from the real
factory, and refuses the coin unless that event names the same wallet as the
deployer. Nothing is taken on trust.

**War scores.** A war stores the block it started at. Every 15 seconds the server
walks the new blocks and pulls `CurveBuy` and `CurveSell` logs filtered on the
roster's addresses — both carry the trader in an indexed field, so one query
covers a whole clan. A wallet's score is what it took out minus what it put in.
Any contract can emit events with those names, so every emitting address is
checked against a real `TokenLaunched` from the Pons factory before it counts.

`npm run test:chain` proves all of it against the live chain: it finds a real
launch, verifies it from its receipt, checks another wallet cannot claim it, and
scans real traders for their net ETH.

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

Clans.team is not affiliated with Robinhood Markets, Robinhood Chain, Pons, or any
wallet whose mark appears here. Marks identify their services and belong to their
owners.

## Layout

```
server/
  db.js                schema, tile grid, event log
  world.js             land, levels, war settlement, world shape
  index.js             auth, routes, SSE, static hosting in production
  chain.js             launch verification and on-chain war scoring
src/
  App.jsx              shell: top bar, menu, panel, hero, ticker, overlays
  lib/brand.js         chain / launchpad / wallet identity
  lib/crest.js         the crest vocabulary, mirrored by server validation
  lib/wallet.js        EIP-1193 connect, chain switch, signing
  lib/pons.js          Pons V2 addresses and ABIs, verified on chain
  lib/launch.js        builds, simulates and sends the clan coin launch
  lib/store.jsx        world state, session, actions, live updates
  ui/Crest.jsx         crest rendering
  globe/Globe.jsx      three.js scene, controls, picking, land layers
  globe/earthTexture.js  the equirectangular map
  panels/Panels.jsx    every panel section
tools/
  build-earth.mjs      compacts Natural Earth GeoJSON into public/data/earth.json
  test-api.mjs         end-to-end game logic check with real signatures
  test-chain.mjs       live read-only check of the Pons integration
  found-clan.mjs       found a clan from the command line
  capture-plugin.mjs   dev-only: POST a frame to /__shot to inspect the globe
```
