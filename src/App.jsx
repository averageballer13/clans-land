import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe from './globe/Globe.jsx'
import Crest from './ui/Crest.jsx'
import { CHAIN, LAUNCHPAD, SITE, TOKEN, WALLETS, WORLD_TILES } from './lib/brand.js'
import { CLANS, clanBy, crestFor, makeTicker, CLAIMED_PCT, TOTAL_LAND, WALLETS_LIVE, LIVE_WARS, BOUNTIES } from './lib/world.js'
import { WorldMap, Directory, Leaderboard, Wars, Bounties, Token, Found, ClanDetail, Rules, Terms } from './panels/Panels.jsx'

const NAV = [
  ['world', 'World map', () => `${CLAIMED_PCT}% claimed`],
  ['found', 'Found a clan', () => 'open'],
  ['directory', 'Clan directory', () => String(CLANS.length)],
  ['bounties', 'Bounties', () => `${BOUNTIES.length} open`],
  ['wars', 'Wars', () => `${LIVE_WARS.length} live`],
  ['leaderboard', 'Leaderboard', () => ''],
  ['token', 'Official token', () => `$${TOKEN.symbol}`],
  ['rules', 'The rules', () => ''],
  ['terms', 'Terms', () => ''],
]

const TITLES = {
  world: 'World Map', found: 'Found a Clan', directory: 'Clan Directory', bounties: 'Bounties',
  wars: 'Wars', leaderboard: 'Leaderboard', token: `$${TOKEN.symbol}`, rules: 'The Rules', terms: 'Terms of Use',
}

/* ---------------- How it works ---------------- */
const HOW = [
  { t: 'Connect', c: `Bring a wallet to ${CHAIN.name}. Nothing is custodial: the site reads the chain, you sign everything yourself.` },
  { t: 'Form a clan', c: 'Up to 50 wallets under one crest. Leader, Co Leaders, Elders, Members. Open, request, or invite only.' },
  { t: 'Take land', c: `6 tiles for the banner, 3 more per wallet, painted around your capital. ${WORLD_TILES} tiles in the world, all of them still open.` },
  { t: 'Deploy the coin', c: `The Leader launches the clan coin on ${LAUNCHPAD.name}. Every trade accrues creator fees to the coin's own vault.` },
  { t: 'Go to war', c: `One number a side: real net ${CHAIN.gas} made during the window. Winner takes a fifth of the loser's land.` },
]

// Illustration only: the walkthrough shows what a crest can look like.
const DEMO_CRESTS = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'].map(crestFor)

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
function WalletSheet({ onClose, onConnect }) {
  const [ok, setOk] = useState([false, false])
  const gates = [
    `I understand Clans is a game layer over public ${CHAIN.name} data and holds none of my funds.`,
    'I accept the Terms of Use and understand nothing here is financial advice.',
  ]
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>Connect wallet</h2>
        <span className="lbl">{CHAIN.name} · chain reads only, you sign everything</span>
        <div className="tosgate" style={{ marginTop: 16 }}>
          {gates.map((g, i) => (
            <button key={i} className={`tosrow ${ok[i] ? 'on' : ''}`} onClick={() => setOk((o) => o.map((v, n) => (n === i ? !v : v)))}>
              <span className="tosbox">{ok[i] && <span className="tosmark" />}</span>
              <span>{g}</span>
            </button>
          ))}
        </div>
        {WALLETS.map((w) => (
          <button key={w.id} className="wopt" disabled={!ok[0] || !ok[1]} onClick={() => onConnect(w)}>
            <span className="w"><img src={w.logo} alt="" />{w.name}</span>
            <span className="lbl">Connect</span>
          </button>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- App ---------------- */
export default function App() {
  const [menu, setMenu] = useState(false)
  const [view, setView] = useState(null)
  const [clanId, setClanId] = useState(null)
  const [how, setHow] = useState(false)
  const [wallet, setWallet] = useState(null)
  const [sheet, setSheet] = useState(false)
  const [toasts, setToasts] = useState([])
  const [tip, setTip] = useState(null)
  const [focus, setFocus] = useState(null)
  const [q, setQ] = useState('')
  const [booted, setBooted] = useState(false)
  const tipRef = useRef(null)
  const ticker = useMemo(() => makeTicker(), [])
  const [tickI, setTickI] = useState(0)

  const toast = useCallback((text) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const go = useCallback((v, id) => {
    if (v === 'clan') { setClanId(id); setView('clan') } else { setView(v); setClanId(null) }
    setMenu(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 900)
    const iv = setInterval(() => setTickI((i) => (i + 1) % 1e9), 3200)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setView(null); setMenu(false); setSheet(false); setHow(false) } }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const onHover = useCallback((hit, px) => {
    if (!hit) { setTip(null); return }
    setTip({ c: hit.clan ? clanBy(hit.clan) : null, x: px.x, y: px.y, lat: hit.lat, lon: hit.lon })
  }, [])

  const results = q.trim().length
    ? CLANS.filter((c) => (c.name + c.tag).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : []

  const visible = ticker.slice(tickI % ticker.length, (tickI % ticker.length) + 3)

  return (
    <div className="app">
      <Globe onHover={onHover} onPick={(id) => go('clan', id)} focus={focus} paused={how} />

      <div ref={tipRef} className={`gtip ${tip ? 'show' : ''}`} style={tip ? { left: tip.x, top: tip.y } : undefined}>
        {tip && (
          <>
            {tip.c ? (
              <>
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <Crest tag={tip.c.tag} spec={tip.c.crest} size={22} />
                  <span className="n">{tip.c.name}</span>
                </div>
                <div className="lbl" style={{ marginTop: 5 }}>
                  [{tip.c.tag}] · {tip.c.land} tiles · lvl {tip.c.lvl}
                </div>
              </>
            ) : (
              <div className="n">Unclaimed</div>
            )}
            <div className="lbl" style={{ marginTop: tip.c ? 2 : 5 }}>{tip.lat.toFixed(1)}°, {tip.lon.toFixed(1)}°</div>
          </>
        )}
      </div>

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
          <div className="gstat"><span className="lbl">Clans</span><span className="v">{CLANS.length}</span></div>
          <div className="gstat opt"><span className="lbl">Land</span><span className="v acc">{CLAIMED_PCT}%</span></div>
          <div className="gstat"><span className="lbl">Wars</span><span className="v">{LIVE_WARS.length}</span></div>
          <div className="gstat opt"><span className="lbl"><span className="livedot" /></span><span className="v">{WALLETS_LIVE} wallets</span></div>
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

        {wallet ? (
          <span className="chainpill"><img src={wallet.logo} alt="" /> {wallet.name}</span>
        ) : (
          <button className="btn solid small" onClick={() => setSheet(true)}>Connect</button>
        )}
      </div>

      {/* -------- menu -------- */}
      <div className={`scrim ${menu ? 'show' : ''}`} onClick={() => setMenu(false)} />
      <aside className={`menu ${menu ? 'open' : ''}`}>
        <nav>
          {NAV.map(([k, label, meta]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => go(k)}>
              {label}
              <span className="k">{meta()}</span>
            </button>
          ))}
        </nav>
        <div className="foot">
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
          <div className="panel-title">{view === 'clan' ? clanBy(clanId)?.name : TITLES[view] || ''}</div>
        </div>
        <div className="panel-body">
          {view === 'world' && <WorldMap go={go} />}
          {view === 'found' && <Found toast={toast} />}
          {view === 'directory' && <Directory go={go} toast={toast} />}
          {view === 'bounties' && <Bounties toast={toast} />}
          {view === 'wars' && <Wars go={go} />}
          {view === 'leaderboard' && <Leaderboard go={go} />}
          {view === 'token' && <Token />}
          {view === 'rules' && <Rules />}
          {view === 'terms' && <Terms />}
          {view === 'clan' && <ClanDetail id={clanId} toast={toast} focus={setFocus} />}
        </div>
      </div>

      {/* -------- hero -------- */}
      <div className={`hero ${view ? 'compact' : ''}`}>
        {view ? (
          <>
            <span className="hero-kicker lbl">
              {CHAIN.name} · coins on {LAUNCHPAD.name} · {TOTAL_LAND} / {WORLD_TILES} tiles taken
            </span>
            <div className="hero-cta">
              {!wallet && <button className="btn small solid" onClick={() => setSheet(true)}>Connect wallet</button>}
              <button className="btn small" onClick={() => setHow(true)}>How it works</button>
            </div>
          </>
        ) : (
          <>
            <div className="hero-kicker lbl">Genesis · {CHAIN.name} · {LAUNCHPAD.name}</div>
            <h1 className="hero-title">
              <span>Clans</span> <span>The&nbsp;World</span> <span>of</span> <span className="hero-fi">SocialFi</span>
            </h1>
            <p className="hero-sub">
              Social trading as a competitive game, run by the community. Nobody wins alone: wallets
              form clans, clans take land, clan coins launched on {LAUNCHPAD.name} earn the creator
              rewards, wars settle the rest. The map is empty — the first clan takes first pick.
            </p>
            <div className="hero-chips">
              <span className="hero-chip"><img src={CHAIN.logo} alt="" style={{ height: 11 }} />{CHAIN.name}</span>
              <span className="hero-chip"><b className="num">{CLANS.length}</b> clans founded</span>
              <span className="hero-chip"><b className="num">{TOTAL_LAND}</b> / {WORLD_TILES} tiles taken</span>
              <span className="hero-chip"><b className="num">{CLAIMED_PCT}%</b> of the world claimed</span>
            </div>
            <div className="hero-cta">
              {!wallet
                ? <button className="btn solid" onClick={() => setSheet(true)}>Connect wallet</button>
                : <button className="btn solid" onClick={() => go('found')}>Found the first clan</button>}
              <button className="btn" onClick={() => setHow(true)}>How it works</button>
              <button className="btn" onClick={() => go('rules')}>The rules</button>
            </div>
          </>
        )}
      </div>

      {/* -------- ticker -------- */}
      <div className="ticker">
        <span className="feedpill live"><i className="dot" /> {CHAIN.short} feed</span>
        {visible.map((t, i) => (
          <span className="item" key={`${tickI}-${i}`}>
            <span className="lbl on">{t.tag}</span>
            <span>{t.text}</span>
            {t.delta !== null && (
              <span className={t.delta > 0 ? 'up' : 'down'}>{t.delta > 0 ? '+' : ''}{t.delta} {CHAIN.gas}</span>
            )}
          </span>
        ))}
        <span className="fps" style={{ marginLeft: 'auto' }}>{TOTAL_LAND}/{WORLD_TILES} tiles held</span>
      </div>

      {/* -------- toasts -------- */}
      <div className="toasts">
        {toasts.map((t) => <div className="toast" key={t.id}>{t.text}</div>)}
      </div>

      {sheet && <WalletSheet onClose={() => setSheet(false)} onConnect={(w) => { setWallet(w); setSheet(false); toast(`${w.name} connected`) }} />}
      {how && <HowItWorks onClose={() => setHow(false)} />}

      <div className={`boot ${booted ? 'gone' : ''}`}>
        <div style={{ textAlign: 'center' }}>
          <div className="wordmark" style={{ fontSize: 30 }}>
            <span className="wm-word">{SITE.name}<i className="wm-tld">{SITE.tld}</i></span>
          </div>
          <div className="lbl" style={{ marginTop: 8 }}>Reading {CHAIN.name}</div>
          <div className="bootbar"><i style={{ width: booted ? '100%' : '35%' }} /></div>
        </div>
      </div>
    </div>
  )
}
