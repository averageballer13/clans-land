import { useCallback, useEffect, useRef, useState } from 'react'
import Globe from './globe/Globe.jsx'
import Crest from './ui/Crest.jsx'
import { WorldProvider, useWorld } from './lib/store.jsx'
import { randomCrest } from './lib/crest.js'
import { providers, hasWallet } from './lib/wallet.js'
import { CHAIN, LAUNCHPAD, SITE, TOKEN, WALLETS, WORLD_TILES, shortAddr } from './lib/brand.js'
import {
  WorldMap, Directory, Leaderboard, Wars, Bounties, Token, Found, ClanDetail, Rules, Terms,
} from './panels/Panels.jsx'

const TITLES = {
  world: 'World Map', found: 'Found a Clan', directory: 'Clan Directory', bounties: 'Bounties',
  wars: 'Wars', leaderboard: 'Leaderboard', token: `$${TOKEN.symbol}`, rules: 'The Rules', terms: 'Terms of Use',
}

/* ---------------- How it works ---------------- */
const HOW = [
  { t: 'Connect', c: `Bring a wallet to ${CHAIN.name}. Signing in signs a plain message — no gas, no transaction, no access to your funds.` },
  { t: 'Form a clan', c: 'Up to 50 wallets under one crest. Leader, Co Leaders, Elders, Members. Open, request, or invite only.' },
  { t: 'Take land', c: `Plant a capital anywhere still open and the map paints outward: 6 tiles for the banner, 3 more per wallet. ${WORLD_TILES} tiles in the world, shared by everyone.` },
  { t: 'Deploy the coin', c: `The Leader launches the clan coin on ${LAUNCHPAD.name} and registers it. Every trade accrues creator fees to the coin's own vault.` },
  { t: 'Go to war', c: `One number a side: net ${CHAIN.gas} made during the window. When the clock runs out the winner takes a fifth of the loser's land.` },
]
const DEMO_CRESTS = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'].map(randomCrest)

function HowItWorks({ onClose }) {
  const [i, setI] = useState(0)
  const s = HOW[i]
  return (
    <div className="howwrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="howbox">
        <div className="howbrand">
          <img src={CHAIN.logo} alt="" style={{ height: 18 }} />
          <span className="howword">{SITE.name}<i className="wm-tld">{SITE.tld}</i></span>
          <span className="lbl" style={{ marginLeft: 'auto' }}>{i + 1} / {HOW.length}</span>
        </div>
        <div className="howscene" key={i}>
          <div className="howart">
            {i === 0 && <><span className="howring" /><span className="howring r2" /><span className="howcore"><img src={CHAIN.logo} alt="" style={{ height: 34 }} /></span><span className="howchip">Self custody</span></>}
            {i === 1 && <><span className="howshield sm l"><Crest tag="A" spec={DEMO_CRESTS[0]} size={44} /></span><span className="howshield sm r"><Crest tag="B" spec={DEMO_CRESTS[1]} size={44} /></span><span className="howstream"><i /><i /><i /></span><span className="howchip">50 wallets, one crest</span></>}
            {i === 2 && <><span className="howland a" /><span className="howland b" /><span className="howchip">{WORLD_TILES} tiles</span></>}
            {i === 3 && <><span className="howcoin"><img src={LAUNCHPAD.logo} alt="" style={{ height: 44, background: '#fff', border: '1px solid var(--line)' }} /></span><span className="howticket">Creator vault · {LAUNCHPAD.name}</span></>}
            {i === 4 && <><span className="howshield sm l"><Crest tag="C" spec={DEMO_CRESTS[2]} size={40} /></span><span className="howshield sm r"><Crest tag="D" spec={DEMO_CRESTS[3]} size={40} /></span><span className="howclash" style={{ fontSize: 26 }}>✕</span><span className="howchip">Winner takes the land</span></>}
          </div>
          <div className="howtitle">{s.t}</div>
          <p className="howcopy">{s.c}</p>
        </div>
        <div className="howfoot">
          <div className="howdots">
            {HOW.map((_, n) => <button key={n} className={`howdot ${n === i ? 'on' : ''}`} onClick={() => setI(n)} aria-label={`Step ${n + 1}`} />)}
          </div>
          {i < HOW.length - 1
            ? <button className="btn small solid" onClick={() => setI(i + 1)}>Next</button>
            : <button className="btn small solid" onClick={onClose}>Enter the world</button>}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Wallet sheet ---------------- */
function WalletSheet({ onClose, toast }) {
  const { signIn } = useWorld()
  const [ok, setOk] = useState([false, false])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const detected = providers()
  const gates = [
    `I understand Clans.land is a game layer over public ${CHAIN.name} activity and holds none of my funds.`,
    'I accept the Terms of Use and understand nothing here is financial advice.',
  ]
  const ready = ok[0] && ok[1]

  const go = async (id, name) => {
    setBusy(true); setError(null)
    try {
      const s = await signIn(id)
      toast(`${name} connected`)
      onClose()
      return s
    } catch (e) {
      setError(e?.message || 'the wallet refused')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>Connect wallet</h2>
        <span className="lbl">{CHAIN.name} · chain {CHAIN.id} · you sign a message, never a transaction</span>
        <div className="tosgate" style={{ marginTop: 16 }}>
          {gates.map((g, i) => (
            <button key={i} className={`tosrow ${ok[i] ? 'on' : ''}`} onClick={() => setOk((o) => o.map((v, n) => (n === i ? !v : v)))}>
              <span className="tosbox">{ok[i] && <span className="tosmark" />}</span>
              <span>{g}</span>
            </button>
          ))}
        </div>

        {detected.length > 0 ? detected.map((d) => {
          const known = WALLETS.find((w) => w.id === d.id)
          return (
            <button key={d.id} className="wopt" disabled={!ready || busy} onClick={() => go(d.id, d.name)}>
              <span className="w">{known && <img src={known.logo} alt="" />}{d.name}</span>
              <span className="lbl">{busy ? 'Waiting…' : 'Connect'}</span>
            </button>
          )
        }) : (
          <>
            <p className="empty-copy" style={{ margin: '4px 0 12px' }}>
              No wallet detected in this browser. Install one, then reload this page.
            </p>
            {WALLETS.map((w) => (
              <a key={w.id} className="wopt" href={
                w.id === 'metamask' ? 'https://metamask.io/download/'
                  : w.id === 'rabby' ? 'https://rabby.io/'
                    : w.id === 'coinbase' ? 'https://www.coinbase.com/wallet/downloads'
                      : 'https://walletconnect.network/'
              } target="_blank" rel="noreferrer noopener">
                <span className="w"><img src={w.logo} alt="" />{w.name}</span>
                <span className="lbl">Install</span>
              </a>
            ))}
          </>
        )}

        {error && <p className="empty-copy down" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Shell ---------------- */
function Shell({ toast, toasts }) {
  const world = useWorld()
  const { clans, tiles, events, stats, status, me, signedIn, signOut, clanBy } = world

  const [menu, setMenu] = useState(false)
  const [view, setView] = useState(null)
  const [clanId, setClanId] = useState(null)
  const [how, setHow] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [tip, setTip] = useState(null)
  const [focus, setFocus] = useState(null)
  const [q, setQ] = useState('')
  const [booted, setBooted] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [capital, setCapital] = useState(null)
  const [tickI, setTickI] = useState(0)
  const tipRef = useRef(null)

  const go = useCallback((v, id) => {
    if (v === 'clan') { setClanId(id); setView('clan') } else { setView(v); setClanId(null) }
    setMenu(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 900)
    const iv = setInterval(() => setTickI((i) => i + 1), 3600)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (pickMode) { setPickMode(false); return }
      setView(null); setMenu(false); setSheet(false); setHow(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [pickMode])

  const onHover = useCallback((hit, px) => {
    if (!hit) { setTip(null); return }
    setTip({ clan: hit.clan, x: px.x, y: px.y, lat: hit.lat, lon: hit.lon })
  }, [])

  const onPickPoint = useCallback((lat, lon) => {
    setCapital([lat, lon])
    setPickMode(false)
    toast(`Capital at ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`)
  }, [toast])

  const startPick = useCallback(() => {
    setPickMode(true)
    toast('Click anywhere on the globe')
  }, [toast])

  const results = q.trim().length
    ? clans.filter((c) => (c.name + c.tag).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : []

  const feed = events.length
    ? events
    : [{ id: 'g1', tag: 'GENESIS', text: 'the world is unclaimed' },
      { id: 'g2', tag: 'GENESIS', text: `${stats.totalTiles || WORLD_TILES} tiles open, none taken` },
      { id: 'g3', tag: 'GENESIS', text: 'the first clan founded picks first' }]
  const visible = Array.from({ length: Math.min(3, feed.length) }, (_, i) => feed[(tickI + i) % feed.length])

  const tipClan = tip?.clan ? clanBy(tip.clan) : null

  return (
    <div className="app">
      <Globe
        tiles={tiles}
        clans={clans}
        onHover={onHover}
        onPick={(id) => go('clan', id)}
        onPickPoint={onPickPoint}
        pickMode={pickMode}
        marker={capital}
        focus={focus}
        paused={how}
      />

      <div ref={tipRef} className={`gtip ${tip ? 'show' : ''}`} style={tip ? { left: tip.x, top: tip.y } : undefined}>
        {tip && (
          <>
            {tipClan ? (
              <>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <Crest tag={tipClan.tag} spec={tipClan.crest} size={22} />
                  <span className="n">{tipClan.name}</span>
                </div>
                <div className="lbl" style={{ marginTop: 5 }}>[{tipClan.tag}] · {tipClan.land} tiles · lvl {tipClan.lvl}</div>
              </>
            ) : (
              <div className="n">{pickMode ? 'Plant the capital here' : 'Unclaimed'}</div>
            )}
            <div className="lbl" style={{ marginTop: tipClan ? 2 : 5 }}>{tip.lat.toFixed(1)}°, {tip.lon.toFixed(1)}°</div>
          </>
        )}
      </div>

      {pickMode && (
        <div className="snapbar">Click the globe to plant your capital · Esc to cancel</div>
      )}

      {/* -------- top bar -------- */}
      <div className="topbar">
        <button className="menubtn" onClick={() => setMenu((m) => !m)} aria-label="Menu">
          <svg width="18" height="14" viewBox="0 0 18 14">
            <line x1="1" y1="2" x2="17" y2="2" />
            <line x1="1" y1="7" x2="17" y2="7" />
            <line x1="1" y1="12" x2="17" y2="12" />
          </svg>
        </button>
        <div className="wordmark" onClick={() => { setView(null); setMenu(false) }}>
          <span className="wm-word">{SITE.name}<i className="wm-tld">{SITE.tld}</i></span>
          <span className="wm-marks">
            <span className="sep" />
            <img src={CHAIN.logo} alt={CHAIN.name} title={`Built on ${CHAIN.name}`} />
          </span>
        </div>

        <div className="globalstats">
          <div className="gstat"><span className="lbl">Clans</span><span className="v">{stats.clans}</span></div>
          <div className="gstat opt"><span className="lbl">Land</span><span className="v acc">{stats.claimedPct}%</span></div>
          <div className="gstat"><span className="lbl">Wars</span><span className="v">{stats.liveWars}</span></div>
          <div className="gstat opt"><span className="lbl"><span className="livedot" /></span><span className="v">{stats.wallets} wallets</span></div>
          <a className="gstat opt tokenlink" href={LAUNCHPAD.site} target="_blank" rel="noreferrer noopener">
            <span className="lbl">Token</span><span className="v gold">${TOKEN.symbol}</span>
          </a>
        </div>

        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clans" aria-label="Search clans" />
          {results.length > 0 && (
            <div className="results">
              {results.map((c) => (
                <button className="result" key={c.id} onClick={() => { go('clan', c.id); setQ('') }}>
                  <span style={{ display: 'flex', gap: 9, alignItems: 'center', minWidth: 0 }}>
                    <Crest tag={c.tag} spec={c.crest} size={20} />
                    <span className="n">{c.name}</span>
                  </span>
                  <span className="lbl">{c.tag}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {signedIn ? (
          <button className="chainpill" title={me.address} onClick={() => { signOut(); toast('Signed out') }}>
            <span className="livedot" style={{ margin: 0 }} />
            {me.clan ? `[${me.clan.id.toUpperCase()}] ` : ''}{shortAddr(me.address)}
          </button>
        ) : (
          <button className="btn solid small" onClick={() => setSheet(true)}>Connect</button>
        )}
      </div>

      {/* -------- menu -------- */}
      <div className={`scrim ${menu ? 'show' : ''}`} onClick={() => setMenu(false)} />
      <aside className={`menu ${menu ? 'open' : ''}`}>
        <nav>
          {[
            ['world', 'World map', `${stats.claimedPct}% claimed`],
            ['found', 'Found a clan', me?.clan ? 'held' : 'open'],
            ['directory', 'Clan directory', String(stats.clans)],
            ['bounties', 'Bounties', `${stats.openBounties} open`],
            ['wars', 'Wars', `${stats.liveWars} live`],
            ['leaderboard', 'Leaderboard', ''],
            ['token', 'Official token', `$${TOKEN.symbol}`],
            ['rules', 'The rules', ''],
            ['terms', 'Terms', ''],
          ].map(([k, label, meta]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => go(k)}>
              {label}<span className="k">{meta}</span>
            </button>
          ))}
        </nav>
        <div className="foot">
          {me?.clan && <button className="btn small" onClick={() => go('clan', me.clan.id)}>My clan</button>}
          <button className="btn small solid" onClick={() => { setMenu(false); setHow(true) }}>How it works</button>
          <a className="btn small ghost" href={CHAIN.docs} target="_blank" rel="noreferrer noopener">{CHAIN.name} docs</a>
        </div>
      </aside>

      {/* -------- panel -------- */}
      <div className={`panel ${view ? 'open' : ''}`}>
        <button className="xclose" onClick={() => setView(null)} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
        <div className="panel-head">
          <div className="panel-title">{view === 'clan' ? clanBy(clanId)?.name ?? 'Clan' : TITLES[view] || ''}</div>
        </div>
        <div className="panel-body">
          {view === 'world' && <WorldMap go={go} />}
          {view === 'found' && (
            <Found toast={toast} go={go} capital={capital} pickMode={pickMode} onPickCapital={startPick} />
          )}
          {view === 'directory' && <Directory go={go} toast={toast} />}
          {view === 'bounties' && <Bounties toast={toast} />}
          {view === 'wars' && <Wars go={go} toast={toast} />}
          {view === 'leaderboard' && <Leaderboard go={go} />}
          {view === 'token' && <Token />}
          {view === 'rules' && <Rules />}
          {view === 'terms' && <Terms />}
          {view === 'clan' && <ClanDetail id={clanId} toast={toast} focus={setFocus} go={go} />}
        </div>
      </div>

      {/* -------- hero -------- */}
      <div className={`hero ${view ? 'compact' : ''}`}>
        {view ? (
          <>
            <span className="hero-kicker lbl">
              {CHAIN.name} · coins on {LAUNCHPAD.name} · {stats.takenTiles} / {stats.totalTiles || WORLD_TILES} tiles taken
            </span>
            <div className="hero-cta">
              {!signedIn && <button className="btn small solid" onClick={() => setSheet(true)}>Connect wallet</button>}
              <button className="btn small" onClick={() => setHow(true)}>How it works</button>
            </div>
          </>
        ) : (
          <>
            <div className="hero-kicker lbl">{stats.clans === 0 ? 'Genesis' : 'Live'} · {CHAIN.name} · {LAUNCHPAD.name}</div>
            <h1 className="hero-title">
              <span>Clans</span> <span>The&nbsp;World</span> <span>of</span> <span className="hero-fi">SocialFi</span>
            </h1>
            <p className="hero-sub">
              Social trading as a competitive game, run by the community. Nobody wins alone: wallets
              form clans, clans take land, clan coins launched on {LAUNCHPAD.name} earn the creator
              rewards, wars settle the rest.{stats.clans === 0 ? ' The map is empty — the first clan takes first pick.' : ''}
            </p>
            <div className="hero-chips">
              <span className="hero-chip"><img src={CHAIN.logo} alt="" style={{ height: 11 }} />{CHAIN.name}</span>
              <span className="hero-chip"><b className="num">{stats.clans}</b> clans</span>
              <span className="hero-chip"><b className="num">{stats.takenTiles}</b> / {stats.totalTiles || WORLD_TILES} tiles taken</span>
              <span className="hero-chip"><b className="num">{stats.wallets}</b> wallets</span>
            </div>
            <div className="hero-cta">
              {!signedIn
                ? <button className="btn solid" onClick={() => setSheet(true)}>Connect wallet</button>
                : me?.clan
                  ? <button className="btn solid" onClick={() => go('clan', me.clan.id)}>My clan</button>
                  : <button className="btn solid" onClick={() => go('found')}>{stats.clans === 0 ? 'Found the first clan' : 'Found a clan'}</button>}
              <button className="btn" onClick={() => setHow(true)}>How it works</button>
              <button className="btn" onClick={() => go('directory')}>Clan directory</button>
            </div>
          </>
        )}
      </div>

      {/* -------- ticker -------- */}
      <div className="ticker">
        <span className={`feedpill ${status === 'live' ? 'live' : status === 'offline' ? 'off' : 'snap'}`}>
          <i className="dot" /> {status === 'live' ? `${CHAIN.short} world live` : status === 'offline' ? 'World offline' : 'Connecting'}
        </span>
        {visible.map((e, i) => (
          <span className="item" key={`${e.id}-${i}`}>
            {e.tag && <span className="lbl on">{e.tag}</span>}
            <span>{e.text}</span>
          </span>
        ))}
        <span className="fps" style={{ marginLeft: 'auto' }}>{stats.takenTiles}/{stats.totalTiles || WORLD_TILES} tiles held</span>
      </div>

      <div className="toasts">
        {toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}
      </div>

      {sheet && <WalletSheet onClose={() => setSheet(false)} toast={toast} />}
      {how && <HowItWorks onClose={() => setHow(false)} />}

      <div className={`boot ${booted ? 'gone' : ''}`}>
        <div style={{ textAlign: 'center' }}>
          <div className="wordmark" style={{ fontSize: 30 }}>
            <span className="wm-word">{SITE.name}<i className="wm-tld">{SITE.tld}</i></span>
          </div>
          <div className="lbl" style={{ marginTop: 8 }}>Reading the world</div>
          <div className="bootbar"><i style={{ width: booted ? '100%' : '35%' }} /></div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- App ---------------- */
export default function App() {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <WorldProvider onToast={toast}>
      <Shell toast={toast} toasts={toasts} />
    </WorldProvider>
  )
}
