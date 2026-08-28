import { useMemo, useState } from 'react'
import Crest from '../ui/Crest.jsx'
import { CHAIN, LAUNCHPAD, TOKEN, DEV_WALLET, shortAddr, WORLD_TILES, CLAN_MAX } from '../lib/brand.js'
import {
  CLANS, clanBy, membersOf, LIVE_WARS, SETTLED_WARS, BOUNTIES,
  TOTAL_LAND, CLAIMED_PCT, WALLETS_LIVE, CREST_SHAPES, CREST_FIELDS,
  CREST_CHARGES, CREST_INKS, CREST_GROUNDS, ROLES,
} from '../lib/world.js'

const eth = (n) => `${n > 0 ? '+' : ''}${n.toFixed(3)} ${CHAIN.gas}`
const money = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`)
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'faint')

function Spark({ seed, w = 74, h = 26, color = 'var(--acc)' }) {
  const d = useMemo(() => {
    let s = seed >>> 0 || 7
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const pts = Array.from({ length: 16 }, (_, i) => [(i / 15) * w, h - 3 - rnd() * (h - 6)])
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  }, [seed, w, h])
  return (
    <svg className="lb-spark" viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" opacity="0.85" />
    </svg>
  )
}

/* Every list ships empty at genesis, so each one says what would fill it
   and what the visitor can do about it right now. */
function Empty({ title, copy, action, onAction }) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="15" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M2 17h30M17 2c5 5 5 25 0 30M17 2c-5 5-5 25 0 30" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
      <div className="empty-title">{title}</div>
      <p className="empty-copy">{copy}</p>
      {action && <button className="btn small solid" onClick={onAction}>{action}</button>}
    </div>
  )
}

function Chain() {
  return (
    <span className="chainpill">
      <img src={CHAIN.logo} alt="" /> <b>{CHAIN.name}</b>
    </span>
  )
}

/* ================= World map ================= */
export function WorldMap({ go }) {
  return (
    <>
      <div className="statrow">
        <div className="stat"><span className="lbl">Land claimed</span><span className="v big">{CLAIMED_PCT}%</span></div>
        <div className="stat"><span className="lbl">Tiles held</span><span className="v big">{TOTAL_LAND}<span className="faint" style={{ fontSize: 14 }}> / {WORLD_TILES}</span></span></div>
        <div className="stat"><span className="lbl">Clans</span><span className="v big">{CLANS.length}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chain />
        <span className="chainpill"><img src={LAUNCHPAD.logo} alt="" /> Coins on <b>{LAUNCHPAD.name}</b></span>
        <span className={`feedpill ${CLANS.length ? 'live' : 'snap'}`}>
          <i className="dot" /> {CLANS.length ? 'Chain feed live' : 'Genesis · nothing claimed'}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.62, marginBottom: 16 }}>
        The map is the prize. Every clan holds land — 6 tiles for the banner plus 3 per member —
        painted in its crest colours around its capital. The world has {WORLD_TILES} tiles. When they
        run out, war is the only way to grow.
      </p>
      <hr className="hr" />
      <div className="lbl" style={{ padding: '14px 0 6px' }}>Capitals</div>
      {CLANS.length === 0 && (
        <Empty
          title="No capital has been planted"
          copy={`All ${WORLD_TILES} tiles are open. The first clan founded picks anywhere on the map and paints outward from there.`}
          action="Found the first clan"
          onAction={() => go('found')}
        />
      )}
      {CLANS.map((c) => (
        <div className="dirrow" key={c.id} onClick={() => go('clan', c.id)}>
          <Crest tag={c.tag} spec={c.crest} size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="lb-name"><span className="n">{c.name}<span className="lvlchip">LVL {c.lvl}</span></span></div>
            <span className="lbl">{c.cap[0].toFixed(1)}°, {c.cap[1].toFixed(1)}° · {c.region}</span>
          </div>
          <span className="num" style={{ fontSize: 13 }}>{c.land} <span className="faint">tiles</span></span>
        </div>
      ))}
    </>
  )
}

/* ================= Directory ================= */
export function Directory({ go, toast }) {
  const [tab, setTab] = useState('all')
  const list = CLANS.filter((c) => (tab === 'all' ? true : tab === 'open' ? c.entry === 'open' : c.entry !== 'open'))
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 0 10px' }}>
        <div className="seg" style={{ flex: 1 }}>
          {[['all', 'All'], ['open', 'Open'], ['closed', 'Invite only']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <button className="btn small solid" style={{ marginLeft: 14 }} onClick={() => go('found')}>Found a clan</button>
      </div>
      {list.length === 0 && (
        <Empty
          title="No clans yet"
          copy="Nobody has founded one. Pick a crest, a tag and an entry rule, and you hold the first banner on the map."
          action="Found a clan"
          onAction={() => go('found')}
        />
      )}
      {list.map((c) => (
        <div className="dirrow" key={c.id} onClick={() => go('clan', c.id)}>
          <Crest tag={c.tag} spec={c.crest} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="lb-name">
              <span className="n">{c.name} <span className="faint">[{c.tag}]</span><span className="lvlchip">LVL {c.lvl}</span></span>
            </div>
            <span className="lbl">
              {c.members} / {CLAN_MAX} · {c.wins}W {c.losses}L · {c.entry === 'open' ? 'Open' : c.entry === 'invite' ? 'Invite only' : 'Request'} · {c.region}
            </span>
          </div>
          <div className="dirstats">
            <span className="ds"><b className="num">{c.land}</b><span className="lbl">tiles</span></span>
            <span className="ds"><b className="num gold">{c.trophies}</b></span>
          </div>
          <button
            className="btn small"
            onClick={(e) => { e.stopPropagation(); toast(c.entry === 'open' ? `Joined ${c.tag}` : `Request sent to ${c.tag}`) }}
          >
            {c.entry === 'open' ? 'Join' : 'Request'}
          </button>
        </div>
      ))}
    </>
  )
}

/* ================= Leaderboard ================= */
export function Leaderboard({ go }) {
  const [tab, setTab] = useState('trophies')
  const sorted = [...CLANS].sort((a, b) => {
    if (tab === 'land') return b.land - a.land
    if (tab === 'profit') return b.profit - a.profit
    if (tab === 'rewards') return (b.coin?.vault || 0) - (a.coin?.vault || 0)
    return b.trophies - a.trophies
  })
  const val = (c) =>
    tab === 'land' ? <span className="num">{c.land}</span>
      : tab === 'profit' ? <span className={`num ${cls(c.profit)}`}>{eth(c.profit)}</span>
        : tab === 'rewards' ? <span className="num gold">{c.coin ? money(c.coin.vault) : '—'}</span>
          : <span className="num gold">{c.trophies}</span>

  return (
    <>
      <div className="seg" style={{ marginBottom: 6 }}>
        {[['trophies', 'Trophies'], ['land', 'Land'], ['profit', 'Profit'], ['rewards', 'Rewards']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {sorted.length === 0 && (
        <Empty
          title="Nothing to rank"
          copy="Trophies come from wars, land from members, rewards from a clan coin's creator vault on Pons. None of it exists yet."
          action="Found a clan"
          onAction={() => go('found')}
        />
      )}
      {sorted.map((c, i) => (
        <div className="lb-row" key={c.id} onClick={() => go('clan', c.id)}>
          <span className={`lb-rank r${i + 1}`}>{i + 1}</span>
          <Crest tag={c.tag} spec={c.crest} size={32} className="shield-mini" />
          <div className="lb-name">
            <div className="n">{c.name}<span className="lvlchip">LVL {c.lvl}</span>{c.coin && <span className="coinchip">${c.coin.symbol}</span>}</div>
            <div className="t">{c.tag} · {c.members} of {CLAN_MAX} · {c.wins}W {c.losses}L{c.coin ? ` · ${money(c.coin.mcap)} MCAP` : ''}</div>
          </div>
          <Spark seed={c.trophies * 977 + i} color={c.crest.ink} />
          <div className="lb-val">{val(c)}</div>
        </div>
      ))}
    </>
  )
}

/* ================= Wars ================= */
function hhmm(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function Wars({ go }) {
  return (
    <>
      <div className="statrow">
        <div className="stat"><span className="lbl">Live</span><span className="v big">{LIVE_WARS.length}</span></div>
        <div className="stat"><span className="lbl">Settled</span><span className="v big">{SETTLED_WARS.length}</span></div>
        <div className="stat"><span className="lbl">Settles in</span><span className="v big">{CHAIN.gas}</span></div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.62, marginBottom: 14 }}>
        A war is one number a side. Each side's score is the real net {CHAIN.gas} its member wallets
        make on {LAUNCHPAD.name} from the moment of declaration, read straight from {CHAIN.name}. When
        the clock runs out the higher score wins, taking a fifth of the loser's land and trophies
        scaled by the margin. There is always a winner: a tie holds for the defender, and the attacker
        pays the land.
      </p>
      <div className="lbl" style={{ padding: '10px 0 2px' }}>Live fronts</div>
      {LIVE_WARS.length === 0 && (
        <Empty
          title="All quiet"
          copy="No war can be declared until there are two clans to declare one."
          action="Found a clan"
          onAction={() => go('found')}
        />
      )}
      {LIVE_WARS.map((w) => {
        const a = clanBy(w.a), b = clanBy(w.b)
        const total = Math.abs(w.sa) + Math.abs(w.sb) || 1
        const pct = ((w.sa + total) / (2 * total)) * 100
        return (
          <div className="warline" key={w.id}>
            <div className="warvs">
              <div className="side" onClick={() => go('clan', a.id)} style={{ cursor: 'pointer' }}>
                <Crest tag={a.tag} spec={a.crest} size={30} />
                <div><div className="num" style={{ fontWeight: 600 }}>{a.tag}</div><div className={`num ${cls(w.sa)}`} style={{ fontSize: 12 }}>{eth(w.sa)}</div></div>
              </div>
              <span className="vs">vs</span>
              <div className="side right" onClick={() => go('clan', b.id)} style={{ cursor: 'pointer' }}>
                <Crest tag={b.tag} spec={b.crest} size={30} />
                <div><div className="num" style={{ fontWeight: 600 }}>{b.tag}</div><div className={`num ${cls(w.sb)}`} style={{ fontSize: 12 }}>{eth(w.sb)}</div></div>
              </div>
            </div>
            <div className="warbar"><div className="a" style={{ width: `${pct}%` }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span className="lbl">{w.stake} tiles at stake</span>
              <span className="lbl on">Ends in {hhmm(w.endsIn)}</span>
            </div>
          </div>
        )
      })}
      {SETTLED_WARS.length > 0 && <div className="lbl" style={{ padding: '18px 0 2px' }}>Recent outcomes</div>}
      {SETTLED_WARS.slice(0, 14).map((w) => {
        const a = clanBy(w.a), b = clanBy(w.b)
        return (
          <div className="warline" key={w.id} style={{ padding: '11px 0' }}>
            <div className="warvs">
              <div className="side"><Crest tag={a.tag} spec={a.crest} size={22} /><span className="num">{a.tag}</span><span className={`num ${cls(w.sa)}`}>{w.sa.toFixed(2)}</span></div>
              <span className="vs">vs</span>
              <div className="side right"><Crest tag={b.tag} spec={b.crest} size={22} /><span className="num">{b.tag}</span><span className={`num ${cls(w.sb)}`}>{w.sb.toFixed(2)}</span></div>
            </div>
            <div className="lbl" style={{ marginTop: 7 }}>{clanBy(w.winner).tag} took the war · {w.ago} ago</div>
          </div>
        )
      })}
    </>
  )
}

/* ================= Bounties ================= */
export function Bounties({ toast }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 12px' }}>
        <span className="lbl">The marketplace: recruiting, crests, trading, open calls</span>
        <button className="btn small solid" onClick={() => toast('Bounty draft saved')}>Post</button>
      </div>
      {BOUNTIES.length === 0 && (
        <Empty
          title="The board is empty"
          copy={`Post anything you will pay for — wallets recruited, crest art, research — and pay the claimer wallet to wallet in ${CHAIN.gas}. Clans is not an escrow.`}
          action="Post the first bounty"
          onAction={() => toast('Bounty draft saved')}
        />
      )}
      {BOUNTIES.map((b) => (
        <div className={`bountyrow ${b.state !== 'open' ? 'done' : ''}`} key={b.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 4 }}>
              <span className="lbl on">{b.kind}</span>
              <span className="coin-chip">[{b.clan}]</span>
              <span className="lbl">{b.ago} ago</span>
            </div>
            <div style={{ fontFamily: 'var(--font-feed)', fontSize: 13.5 }}>{b.title}</div>
            <div className="lbl" style={{ marginTop: 5 }}>
              By {b.by}{b.claimedBy ? ` · claimed by ${b.claimedBy}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num gold" style={{ fontSize: 13 }}>{b.reward} {CHAIN.gas}</div>
            {b.state === 'open'
              ? <button className="btn small" style={{ marginTop: 7 }} onClick={() => toast(`Claimed: ${b.kind}`)}>Claim</button>
              : <div className="lbl" style={{ marginTop: 9 }}>{b.state}</div>}
          </div>
        </div>
      ))}
    </>
  )
}

/* ================= Token ================= */
export function Token() {
  const live = CLANS.filter((c) => c.coin)
  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '6px 0 14px' }}>
        <img src={LAUNCHPAD.logo} alt="" style={{ width: 46, height: 46, border: '1px solid var(--line)', objectFit: 'contain', background: '#fff' }} />
        <div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>${TOKEN.symbol}</div>
          <span className="lbl">Launching on {LAUNCHPAD.name} · {CHAIN.name}</span>
        </div>
        <span className="feedpill snap" style={{ marginLeft: 'auto' }}><i className="dot" /> Not deployed</span>
      </div>

      <div className="statrow">
        <div className="stat"><span className="lbl">Chain</span><span className="v">{CHAIN.short}</span></div>
        <div className="stat"><span className="lbl">Launchpad</span><span className="v">{LAUNCHPAD.name}</span></div>
        <div className="stat"><span className="lbl">Supply</span><span className="v">Fixed</span></div>
      </div>

      <div className="kv">
        <div className="kv-row">
          <span className="lbl">Contract</span>
          <span className="num faint">{TOKEN.address ? TOKEN.address : 'not deployed yet'}</span>
        </div>
        <div className="kv-row">
          <span className="lbl">Deployer wallet</span>
          <span className="chip" style={{ margin: 0 }}>
            <span className="addr" title={DEV_WALLET}>{shortAddr(DEV_WALLET)}</span>
            <button className="cta" onClick={() => navigator.clipboard?.writeText(DEV_WALLET)}>Copy</button>
          </span>
        </div>
      </div>

      <div className="doc">
        <h3>The official coin</h3>
        <p>
          ${TOKEN.symbol} is the house coin of this world. It deploys on <b>{LAUNCHPAD.name}</b>, the
          launchpad native to <b>{CHAIN.name}</b>: fixed supply, liquidity locked, non custodial.
          Until it is live there is no contract address — anything claiming to be ${TOKEN.symbol}
          before it appears here is not ours.
        </p>
        <h3>Clan coins</h3>
        <p>
          Every clan Leader can deploy a clan coin on {LAUNCHPAD.name}. Each trade of it accrues
          creator fees to that coin's own on chain vault, paid by {LAUNCHPAD.name} itself. Clans
          never holds or distributes any of it: the vault belongs to the coin's creator wallet, and
          how a clan shares it is the clan's business.
        </p>
      </div>

      <div className="lbl" style={{ padding: '18px 0 4px' }}>Clan coins live</div>
      {live.length === 0 && (
        <Empty
          title="No clan coin has been deployed"
          copy={`The first Leader to launch one on ${LAUNCHPAD.name} opens their creator vault, and it shows up here.`}
        />
      )}
      {live.map((c) => (
        <div className="coinrow" key={c.id}>
          <Crest tag={c.tag} spec={c.crest} size={32} />
          <div className="lb-name">
            <div className="n">${c.coin.symbol}</div>
            <div className="t">{c.name} · vault {money(c.coin.vault)}</div>
          </div>
          <div className="lb-val num">{money(c.coin.mcap)}</div>
          <span className="faint">&#8250;</span>
        </div>
      ))}

      <div className="chainrow">
        <a className="btn small" href={LAUNCHPAD.site} target="_blank" rel="noreferrer noopener">Open {LAUNCHPAD.name}</a>
        <a className="btn small" href={CHAIN.site} target="_blank" rel="noreferrer noopener">{CHAIN.name}</a>
      </div>
    </>
  )
}

/* ================= Found a clan ================= */
const SEED = { shape: 'heater', field: 'pale', ink: '#ff6a00', ink2: '#f4f1ec', ground: '#101216', charge: 'feather', scale: 1 }

export function Found({ toast }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [entry, setEntry] = useState('open')
  const [spec, setSpec] = useState(SEED)
  const set = (k) => (v) => setSpec((s) => ({ ...s, [k]: v }))

  return (
    <>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 16px' }}>
        Up to {CLAN_MAX} wallets under one crest. You start with 6 tiles for the banner and take
        3 more for every wallet that joins.
      </p>
      <div className="sd-grid">
        <div>
          <Crest tag={tag || 'NEW'} spec={spec} size={172} />
          <div style={{ marginTop: 12 }}>
            <div className="num" style={{ fontWeight: 600 }}>{name || 'Unnamed clan'}</div>
            <span className="lbl">[{tag || '----'}] · {entry === 'open' ? 'Open' : entry === 'invite' ? 'Invite only' : 'Request'}</span>
          </div>
        </div>
        <div>
          <div className="sd-row">
            <span className="lbl">Silhouette</span>
            <div className="sd-opts">
              {CREST_SHAPES.map((s) => (
                <button key={s} className={spec.shape === s ? 'on' : ''} onClick={() => set('shape')(s)} title={s}>
                  <Crest tag={s} spec={{ ...spec, shape: s }} size={24} />
                </button>
              ))}
            </div>
          </div>
          <div className="sd-row">
            <span className="lbl">Field</span>
            <div className="sd-opts">
              {CREST_FIELDS.map((f) => (
                <button key={f} className={spec.field === f ? 'on' : ''} onClick={() => set('field')(f)} title={f}>
                  <Crest tag={f} spec={{ ...spec, field: f, charge: 'none' }} size={24} />
                </button>
              ))}
            </div>
          </div>
          <div className="sd-row">
            <span className="lbl">Charge</span>
            <div className="sd-opts">
              {CREST_CHARGES.map((ch) => (
                <button key={ch} className={spec.charge === ch ? 'on' : ''} onClick={() => set('charge')(ch)} title={ch}>
                  <Crest tag={ch} spec={{ ...spec, charge: ch, field: 'plain' }} size={24} />
                </button>
              ))}
            </div>
          </div>
          <div className="sd-row">
            <span className="lbl">Ink</span>
            <div className="sd-opts">
              {CREST_INKS.map((i) => (
                <button key={i} className={`swatch ${spec.ink === i ? 'on' : ''}`} onClick={() => set('ink')(i)}>
                  <span style={{ background: i }} />
                </button>
              ))}
            </div>
          </div>
          <div className="sd-row">
            <span className="lbl">Ground</span>
            <div className="sd-opts">
              {CREST_GROUNDS.map((i) => (
                <button key={i} className={`swatch ${spec.ground === i ? 'on' : ''}`} onClick={() => set('ground')(i)}>
                  <span style={{ background: i }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <hr className="hr" style={{ margin: '18px 0' }} />
      <div style={{ display: 'grid', gap: 16 }}>
        <label className="field"><span className="lbl">Clan name</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Hood Guard" />
        </label>
        <label className="field"><span className="lbl">Tag</span>
          <input value={tag} maxLength={6} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="HOOD" />
        </label>
        <label className="field"><span className="lbl">Entry</span>
          <select value={entry} onChange={(e) => setEntry(e.target.value)}>
            <option value="open">Open — anyone joins</option>
            <option value="request">Request to join</option>
            <option value="invite">Invite only</option>
          </select>
        </label>
      </div>
      <div className="chainrow" style={{ marginTop: 20 }}>
        <button className="btn solid" disabled={!name || tag.length < 3} onClick={() => toast(`${tag} founded`)}>Found the clan</button>
        <Chain />
      </div>
    </>
  )
}

/* ================= Clan detail ================= */
export function ClanDetail({ id, toast, focus }) {
  const c = clanBy(id)
  const [tab, setTab] = useState('roster')
  const roster = useMemo(() => (c ? membersOf(c) : []), [id])
  if (!c) return null
  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', margin: '4px 0 14px' }}>
        <Crest tag={c.tag} spec={c.crest} size={78} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="num" style={{ fontSize: 19, fontWeight: 600 }}>{c.name}<span className="lvlchip big">LVL {c.lvl}</span></div>
          <span className="lbl">[{c.tag}] · {c.members} of {CLAN_MAX} · {c.region} · {c.lang}</span>
          <div className="xpbar"><div className="fill" style={{ width: `${c.xp}%` }} /></div>
          <div className="lbl" style={{ marginTop: 6 }}>{c.xp}% to level {c.lvl + 1}</div>
        </div>
      </div>
      <div className="statrow" style={{ paddingTop: 6 }}>
        <div className="stat"><span className="lbl">Trophies</span><span className="v gold">{c.trophies}</span></div>
        <div className="stat"><span className="lbl">Land</span><span className="v">{c.land}</span></div>
        <div className="stat"><span className="lbl">Record</span><span className="v">{c.wins}W {c.losses}L</span></div>
        <div className="stat"><span className="lbl">Net</span><span className={`v ${cls(c.profit)}`}>{eth(c.profit)}</span></div>
      </div>
      {c.coin ? (
        <div className="coindeploy live">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="num" style={{ fontWeight: 600 }}>${c.coin.symbol}</div>
              <span className="lbl">Deployed on {LAUNCHPAD.name} · vault {money(c.coin.vault)}</span>
            </div>
            <a className="btn small" href={LAUNCHPAD.site} target="_blank" rel="noreferrer noopener">Trade</a>
          </div>
          <div className="chainrow"><span className="lbl">Market cap</span><span className="num">{money(c.coin.mcap)}</span><div className="curvebar"><i style={{ width: '62%' }} /></div></div>
        </div>
      ) : (
        <div className="coindeploy">
          <span className="lbl on">No clan coin yet</span>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>The Leader can deploy one on {LAUNCHPAD.name} at any time.</p>
        </div>
      )}
      <div className="chainrow" style={{ marginBottom: 8 }}>
        <button className="btn small solid" onClick={() => toast(c.entry === 'open' ? `Joined ${c.tag}` : `Request sent to ${c.tag}`)}>
          {c.entry === 'open' ? 'Join clan' : 'Request to join'}
        </button>
        <button className="btn small" onClick={() => focus([c.cap[0], c.cap[1], 1.9])}>Show capital</button>
        <button className="btn small danger" onClick={() => toast(`War declared on ${c.tag}`)}>Declare war</button>
      </div>
      <div className="seg" style={{ margin: '10px 0 4px' }}>
        {[['roster', 'Roster'], ['land', 'Land'], ['wars', 'Wars']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'roster' && ROLES.map((role) => {
        const rows = roster.filter((m) => m.role === role)
        if (!rows.length) return null
        return (
          <div key={role}>
            <div className="rolehead">{role}</div>
            {rows.map((m) => (
              <div className="member" key={m.handle}>
                <div><span>{m.handle}</span> <span className="lbl" style={{ marginLeft: 8 }}>{m.addr}</span></div>
                <div><span className="gold num">{m.trophies}</span> <span className={`num ${cls(m.pnl)}`} style={{ marginLeft: 12 }}>{eth(m.pnl)}</span></div>
              </div>
            ))}
          </div>
        )
      })}
      {tab === 'land' && (
        <>
          <div className="statrow">
            <div className="stat"><span className="lbl">Capital</span><span className="v">{c.cap[0].toFixed(2)}°, {c.cap[1].toFixed(2)}°</span></div>
            <div className="stat"><span className="lbl">Tiles</span><span className="v">{c.land}</span></div>
          </div>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            6 tiles for the banner plus 3 for each of the {c.members} wallets. Land only changes hands
            through war: the loser gives up a fifth of what it holds.
          </p>
        </>
      )}
      {tab === 'wars' && SETTLED_WARS.filter((w) => w.a === c.id || w.b === c.id).slice(0, 10).map((w) => {
        const other = clanBy(w.a === c.id ? w.b : w.a)
        const won = w.winner === c.id
        return (
          <div className="member" key={w.id}>
            <div><span className="num">vs {other.tag}</span> <span className="lbl" style={{ marginLeft: 8 }}>{w.ago} ago</span></div>
            <span className={won ? 'up' : 'down'}>{won ? 'Won' : 'Lost'}</span>
          </div>
        )
      })}
    </>
  )
}

/* ================= Rules ================= */
export function Rules() {
  return (
    <div className="doc">
      <h3>SocialFi</h3>
      <p>
        Clans is the world of SocialFi on <b>{CHAIN.name}</b>: social trading as a competitive game,
        run by the community. Nobody wins it alone. Wallets form clans, clans take land, clan coins
        launched on <b>{LAUNCHPAD.name}</b> earn the creator rewards, wars settle the rest.
      </p>
      <h3>Clans</h3>
      <p>
        People join up as a team. Up to {CLAN_MAX} wallets under one crest: a Leader, Co Leaders,
        Elders and Members. Entry is open, request to join, or closed. Elders and up accept requests
        and scout new wallets.
      </p>
      <h3>Land</h3>
      <p>
        The map is the prize. Every clan holds land: 6 tiles for the banner plus 3 per member, painted
        in the clan's crest colours around its capital. The world has {WORLD_TILES} tiles. When they
        run out, war is the only way to grow.
      </p>
      <h3>Creator rewards</h3>
      <p>
        Creator rewards come from the clan coin. When the Leader deploys the clan's token on{' '}
        <b>{LAUNCHPAD.name}</b>, every trade of it accrues creator fees to the coin's own on chain
        vault, paid by {LAUNCHPAD.name} itself. Clans never holds or distributes any of it: the vault
        belongs to the coin's creator wallet, and how a clan shares it is the clan's business. The
        bigger the clan and the harder its coin trades, the bigger the vault.
      </p>
      <h3>Wars</h3>
      <p>
        The Leader and Co Leaders declare timed wars. More profit wins: the clan whose wallets print
        more real {CHAIN.gas} on {CHAIN.name} during the war takes the win, a fifth of the loser's
        land, and trophies scaled by the margin. There is always a winner; a tie holds for the
        defender.
      </p>
      <h3>Levels</h3>
      <p>
        Wars and recruitment earn clan XP. Levels raise the tile yield per member, unlock crest
        silhouettes, and open the bounty board to bigger rewards.
      </p>
      <h3>Bounties</h3>
      <p>
        The marketplace. Anyone posts a bounty — recruiting, crest art, research, an open call — and
        anyone can claim it. Payment is wallet to wallet in {CHAIN.gas}. Clans is not an escrow.
      </p>
    </div>
  )
}

/* ================= Terms ================= */
export function Terms() {
  return (
    <div className="doc">
      <span className="lbl">Agreed to at signup · applies to everything on this site</span>
      <h3>1. Acceptance</h3>
      <p>
        Connecting a wallet, founding or joining a clan, posting in any chat, posting or claiming a
        bounty, or otherwise interacting with this site means you accept these terms in full. If you
        do not accept them, you may watch, but do not connect or interact.
      </p>
      <h3>2. What Clans is</h3>
      <p>
        Clans is an interface and a scoreboard. It reads publicly available {CHAIN.name} and{' '}
        {LAUNCHPAD.name} data and organises people into clans around it: land, wars, trophies, levels,
        rewards percentages and chats. It is a game layer over real data. It is not an exchange, a
        broker, a wallet, an investment platform, or an issuer of anything.
      </p>
      <h3>3. Not affiliated</h3>
      <p>
        Clans is not affiliated with, endorsed by, or operated by Robinhood Markets, {CHAIN.name},{' '}
        {LAUNCHPAD.name}, MetaMask, Rabby, Coinbase, WalletConnect, or any other project whose name or
        mark appears here. Names and marks identify their services and belong to their owners.
      </p>
      <h3>4. Eligibility</h3>
      <p>
        You must be of legal age in your jurisdiction and legally permitted to use cryptocurrency
        services where you live. You are solely responsible for determining whether your use of this
        site, and of any token, is lawful where you are.
      </p>
      <h3>5. Wallets and self custody</h3>
      <p>
        Your wallet stays yours at all times. Clans never takes custody of funds, never holds keys,
        and never moves anything on your behalf. Every transaction is signed by you.
      </p>
      <h3>6. No financial advice</h3>
      <p>
        Nothing here is investment, financial, legal or tax advice. Scores, leaderboards, trophies and
        market figures are informational and can be wrong, late, or incomplete. Trading tokens can
        lose you everything you put in.
      </p>
      <h3>7. Rewards</h3>
      <p>
        Creator rewards accrue to a coin's own creator vault on {LAUNCHPAD.name}. Clans neither holds,
        routes, nor distributes them, and makes no promise that any clan will share anything with you.
      </p>
      <h3>8. Conduct</h3>
      <p>
        No illegal content, no impersonation, no market manipulation claims presented as fact, no
        harassment. Clan chats are moderated by their own Leaders. We may remove a clan or a wallet
        from the interface at any time.
      </p>
      <h3>9. Availability</h3>
      <p>
        The site is provided as is, with no warranty of any kind. Chain data feeds may break. Games,
        rules, and figures can change without notice.
      </p>
      <h3>10. Changes</h3>
      <p>Continued use after any update to these terms is acceptance of the update.</p>
    </div>
  )
}
