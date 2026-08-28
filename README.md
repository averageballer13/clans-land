# Clans.land

**The World of SocialFi on Robinhood Chain.** Social trading as a competitive game:
wallets form clans, clans take land on a shared globe, clan coins launched on **Pons**
earn the creator rewards, and timed wars settle the rest.

Same product idea and same art direction as the original `pfclans.fun`, rebuilt for
Robinhood Chain in a pro black / orange theme.

**The world ships empty.** No clans, no land taken, no wars, no bounties, no token
deployed — genesis state, exactly as it will look the moment it goes live. The first
clan founded is genuinely the first clan.

---

## What's in it

| Section | What it does |
| --- | --- |
| World map | Globe overview, capitals, land claimed out of 1200 tiles (0 at genesis) |
| Found a clan | Live crest designer — silhouette, field, charge, inks |
| Clan directory | All clans, entry mode, join / request |
| Bounties | Recruiting, crest art, research, open calls |
| Wars | Live fronts scored in net ETH, settled history |
| Leaderboard | Trophies / land / profit / creator rewards |
| Official token | `$CLANS` on Pons — not deployed yet, deployer wallet shown |
| Rules · Terms | The full ruleset and terms of use |

## The globe

Rendered in three.js from **Natural Earth 1:110m** land, baked at load into a single
equirectangular canvas (`src/globe/earthTexture.js`). Deliberately graphic rather than
cartographic: flat ocean, flat land, one hairline orange coast, a faint 30° graticule.
Nothing on the map competes with the clans.

On top of the sphere: a tight atmospheric rim shader, a hollow radial halo sprite
(a second shader shell peaks at its own limb and reads as a hard ring), 2 600 stars,
clan land as a low additive tint plus crisp territory edges, and capital markers that
breathe. Drag to rotate, wheel to zoom, hover a tile — unclaimed ground reports its
coordinates, claimed ground reports its clan.

## Clan crests

One art direction, eight silhouettes at different proportions — heater, kite, banner,
hex, rondel, lozenge, pennon, tower — crossed with nine field divisions and twelve
charges, all locked to the site palette so the whole set reads as one system
(`src/ui/Crest.jsx`). Charge colour is chosen for contrast against whatever sits
behind it, so nothing ever goes dark on dark.

## Brand assets

Everything in `public/brand/` is the real mark, fetched from the vendor:

- `robinhood-feather.svg` — Robinhood Chain, from `cdn.robinhood.com`
- `pons.png` — the Pons launchpad mark
- `wallet/` — MetaMask, Rabby, Coinbase Wallet, WalletConnect

Pons Clans is not affiliated with Robinhood Markets, Robinhood Chain, Pons, or any
wallet whose mark appears here. Marks identify their services and belong to their
owners.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5183. `npm run build` produces `dist/`.

## Layout

```
src/
  App.jsx              shell: top bar, menu, panel, hero, ticker, overlays
  lib/brand.js         chain / launchpad / wallet identity
  lib/world.js         clans, crest specs, tiles, wars, bounties, feed
  ui/Crest.jsx         the crest system
  globe/Globe.jsx      three.js scene, controls, picking
  globe/earthTexture.js  colour / bump / roughness map baking
  panels/Panels.jsx    every panel section
tools/
  build-earth.mjs      compacts Natural Earth GeoJSON into public/data/earth.json
  capture-plugin.mjs   dev-only: POST a frame to /__shot to inspect the globe
```

Regenerating the geodata (only needed if you want different detail):

```bash
node tools/build-earth.mjs
```

## Note on the data

Clans, wallets, wars and market figures in this build are seeded from a deterministic
generator so the world is stable across reloads. Wiring the panels to live Robinhood
Chain and Pons data is the next step — the shapes in `src/lib/world.js` are what a
real feed would fill.
