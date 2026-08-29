import { useEffect, useMemo, useState } from 'react'
import Crest from '../ui/Crest.jsx'
import { useWorld } from '../lib/store.jsx'
import { CHAIN, LAUNCHPAD, TOKEN, DEV_WALLET, shortAddr, WORLD_TILES, CLAN_MAX } from '../lib/brand.js'
import { CREST_SHAPES, CREST_FIELDS, CREST_CHARGES, CREST_INKS, CREST_GROUNDS, randomCrest } from '../lib/crest.js'
import { launchClanCoin, launchPreflight } from '../lib/launch.js'

const eth = (n) => `${n > 0 ? '+' : ''}${Number(n).toFixed(3)} ${CHAIN.gas}`
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'faint')
const ROLE_LABEL = { leader: 'Leader', coleader: 'Co Leader', elder: 'Elder', member: 'Member' }
const ENTRY_LABEL = { public: 'Public', private: 'Private' }
const isPublic = (c) => c.entry === 'public'

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
function countdown(ts) {
  const s = Math.max(0, (ts - Date.now()) / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/* Runs an action, turns any server refusal into a toast instead of a
   silent no-op, and blocks the button while it is in flight. */
function useAction(toast) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, ok) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
    } catch (e) {
      toast(e.message || 'that did not work')
    } finally {
      setBusy(false)
    }
  }
  return [busy, run]
}

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
  return <span className="chainpill"><img src={CHAIN.logo} alt="" /> <b>{CHAIN.name}</b></span>
}

/* ================= World map ================= */
export function WorldMap({ go }) {
  const { clans, stats } = useWorld()
  return (
    <>
      <div className="statrow">
        <div className="stat"><span className="lbl">Land claimed</span><span className="v big">{stats.claimedPct}%</span></div>
        <div className="stat"><span className="lbl">Tiles held</span><span className="v big">{stats.takenTiles}<span className="faint" style={{ fontSize: 14 }}> / {stats.totalTiles || WORLD_TILES}</span></span></div>
        <div className="stat"><span className="lbl">Clans</span><span className="v big">{stats.clans}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chain />
        <span className="chainpill"><img src={LAUNCHPAD.logo} alt="" /> Coins on <b>{LAUNCHPAD.name}</b></span>
      </div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.62, marginBottom: 16 }}>
        The map is the prize. Every clan holds land — 6 tiles for the banner plus 3 per member —
        painted in its colours around its capital. The world has {stats.totalTiles || WORLD_TILES} tiles.
        When they run out, war is the only way to grow.
      </p>
      <hr className="hr" />
      <div className="lbl" style={{ padding: '14px 0 6px' }}>Capitals</div>
      {clans.length === 0 && (
        <Empty
          title="No capital has been planted"
          copy="Every tile is open. The first clan founded picks anywhere on the map and paints outward from there."
          action="Found the first clan"
          onAction={() => go('found')}
        />
      )}
      {clans.map((c) => (
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
  const { clans, joinClan, signedIn, me } = useWorld()
  const [tab, setTab] = useState('all')
  const [busy, run] = useAction(toast)
  const list = clans.filter((c) => (tab === 'all' ? true : tab === 'public' ? isPublic(c) : !isPublic(c)))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 0 10px' }}>
        <div className="seg" style={{ flex: 1 }}>
          {[['all', 'All'], ['public', 'Public'], ['private', 'Private']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <button className="btn small solid" style={{ marginLeft: 14 }} onClick={() => go('found')}>Found a clan</button>
      </div>
      {list.length === 0 && (
        <Empty
          title={clans.length ? 'Nothing in this filter' : 'No clans yet'}
          copy={clans.length
            ? 'Try another entry mode.'
            : 'Nobody has founded one. Pick a crest, a tag and a capital, and you hold the first banner on the map.'}
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
              {c.members} / {CLAN_MAX} · {c.wins}W {c.losses}L · {ENTRY_LABEL[c.entry]} · {c.region}
            </span>
          </div>
          <div className="dirstats">
            <span className="ds"><b className="num">{c.land}</b><span className="lbl">tiles</span></span>
            <span className="ds"><b className="num gold">{c.trophies}</b></span>
          </div>
          <button
            className="btn small"
            disabled={busy || !signedIn || !!me?.clan}
            onClick={(e) => {
              e.stopPropagation()
              run(() => joinClan(c.id), isPublic(c) ? `Joined ${c.tag}` : `Asked to join ${c.tag}`)
            }}
          >
            {isPublic(c) ? 'Join' : 'Ask to join'}
          </button>
        </div>
      ))}
    </>
  )
}

/* ================= Leaderboard ================= */
export function Leaderboard({ go }) {
  const { clans, players } = useWorld()
  const [side, setSide] = useState('clans')
  const [tab, setTab] = useState('trophies')
  const sorted = [...clans].sort((a, b) => {
    if (tab === 'land') return b.land - a.land
    if (tab === 'members') return b.members - a.members
    if (tab === 'pnl') return b.pnl - a.pnl
    return b.trophies - a.trophies
  })
  const val = (c) =>
    tab === 'land' ? <span className="num">{c.land}</span>
      : tab === 'members' ? <span className="num">{c.members}</span>
        : tab === 'pnl' ? <span className={`num ${cls(c.pnl)}`}>{eth(c.pnl)}</span>
          : <span className="num gold">{c.trophies}</span>

  if (side === 'players') {
    const ranked = [...(players ?? [])].sort((a, b) => b.pnl - a.pnl)
    return (
      <>
        <div className="seg" style={{ marginBottom: 6 }}>
          <button onClick={() => setSide('clans')}>Clans</button>
          <button className="on">Players</button>
        </div>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '10px 0 6px' }}>
          Net {CHAIN.gas} each wallet has made trading on {LAUNCHPAD.name}, read straight off{' '}
          {CHAIN.name}. Nobody reports their own number.
        </p>
        {ranked.filter((p) => p.trades > 0).length === 0 && (
          <Empty
            title="No trades counted yet"
            copy={`As soon as a wallet that has signed in buys or sells on ${LAUNCHPAD.name}, it appears here.`}
          />
        )}
        {ranked.map((p, i) => (
          <div className="lb-row lb-row-4" key={p.address}>
            <span className={`lb-rank r${i + 1}`}>{i + 1}</span>
            <span className="mapicon" style={{ width: 32, height: 32 }}>
              {p.clan ? <Crest tag={p.clan} spec={clans.find((c) => c.id === p.clan)?.crest} size={26} /> : <span className="faint">—</span>}
            </span>
            <div className="lb-name">
              <div className="n">{p.handle}</div>
              <div className="t">{p.clan ? `[${p.clan.toUpperCase()}]` : 'no clan'} · {p.trades} trades · {shortAddr(p.address)}</div>
            </div>
            <div className={`lb-val ${cls(p.pnl)}`}>{eth(p.pnl)}</div>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <div className="seg" style={{ marginBottom: 6 }}>
        <button className="on">Clans</button>
        <button onClick={() => setSide('players')}>Players</button>
      </div>
      <div className="seg" style={{ marginBottom: 6, marginTop: 8 }}>
        {[['trophies', 'Trophies'], ['pnl', 'Profit'], ['land', 'Land'], ['members', 'Members']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {sorted.length === 0 && (
        <Empty
          title="Nothing to rank"
          copy="Trophies come from wars, land from members, levels from both. None of it exists yet."
          action="Found a clan"
          onAction={() => go('found')}
        />
      )}
      {sorted.map((c, i) => (
        <div className="lb-row lb-row-4" key={c.id} onClick={() => go('clan', c.id)}>
          <span className={`lb-rank r${i + 1}`}>{i + 1}</span>
          <Crest tag={c.tag} spec={c.crest} size={32} className="shield-mini" />
          <div className="lb-name">
            <div className="n">{c.name}<span className="lvlchip">LVL {c.lvl}</span>{c.coin && <span className="coinchip">${c.coin.symbol}</span>}</div>
            <div className="t">{c.tag} · {c.members} of {CLAN_MAX} · {c.land} tiles · {eth(c.pnl)}</div>
          </div>
          <div className="lb-val">{val(c)}</div>
        </div>
      ))}
    </>
  )
}

/* ================= Wars ================= */
export function Wars({ go, toast }) {
  const { wars, clanBy, stats, myClan, myRole, clans, declareWar } = useWorld()
  const [busy, run] = useAction(toast)
  const [target, setTarget] = useState('')
  const [hours, setHours] = useState(24)
  const live = wars.filter((w) => !w.settledAt)
  const settled = wars.filter((w) => w.settledAt)
  const canDeclare = myClan && ['leader', 'coleader'].includes(myRole)
  const enemies = clans.filter((c) => c.id !== myClan?.id)
  const atWar = live.some((w) => w.a === myClan?.id || w.b === myClan?.id)

  return (
    <>
      <div className="statrow">
        <div className="stat"><span className="lbl">Live</span><span className="v big">{live.length}</span></div>
        <div className="stat"><span className="lbl">Settled</span><span className="v big">{settled.length}</span></div>
        <div className="stat"><span className="lbl">Scored in</span><span className="v big">{CHAIN.gas}</span></div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.62, marginBottom: 14 }}>
        A war is one number a side: the net {CHAIN.gas} its member wallets make on {LAUNCHPAD.name} from
        the moment of declaration. Nobody reports it: every buy and sell is read straight off{' '}
        {CHAIN.name} and added up. When the clock runs out the higher score wins, taking a fifth of the
        loser's land and trophies scaled by the margin. There is always a winner: a tie holds for the
        defender, and the attacker pays the land.
      </p>

      {canDeclare && !atWar && enemies.length > 0 && (
        <div className="coindeploy live" style={{ marginBottom: 16 }}>
          <span className="lbl on">Declare a war</span>
          <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
            <label className="field"><span className="lbl">Target</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Pick a clan</option>
                {enemies.map((c) => <option key={c.id} value={c.id}>{c.name} [{c.tag}] · {c.land} tiles</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">Length</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {[1, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hours</option>)}
              </select>
            </label>
            <button className="btn small danger" disabled={!target || busy}
              onClick={() => run(() => declareWar(target, hours), 'War declared')}>
              Declare war
            </button>
          </div>
        </div>
      )}

      <div className="lbl" style={{ padding: '10px 0 2px' }}>Live fronts</div>
      {live.length === 0 && (
        <Empty
          title="All quiet"
          copy={clans.length < 2
            ? 'No war can be declared until there are two clans to declare one.'
            : 'Nobody has declared. A Leader or Co Leader can open a front at any time.'}
        />
      )}
      {live.map((w) => {
        const a = clanBy(w.a), b = clanBy(w.b)
        if (!a || !b) return null
        const totalScore = Math.abs(w.sa) + Math.abs(w.sb) || 1
        const pct = ((w.sa + totalScore) / (2 * totalScore)) * 100
        const mine = myClan && (w.a === myClan.id || w.b === myClan.id)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
              <span className="lbl">{w.stake} tiles at stake</span>
              <span className="lbl on">Ends in {countdown(w.endsAt)}</span>
            </div>
            <div className="chainrow">
              <span className="feedpill live"><i className="dot" /> Read from {CHAIN.name}</span>
              {mine && <span className="lbl">Trade on {LAUNCHPAD.name} to move your number</span>}
            </div>
          </div>
        )
      })}

      {settled.length > 0 && <div className="lbl" style={{ padding: '18px 0 2px' }}>Recent outcomes</div>}
      {settled.map((w) => {
        const a = clanBy(w.a), b = clanBy(w.b), win = clanBy(w.winner)
        if (!a || !b) return null
        return (
          <div className="warline" key={w.id} style={{ padding: '11px 0' }}>
            <div className="warvs">
              <div className="side"><Crest tag={a.tag} spec={a.crest} size={22} /><span className="num">{a.tag}</span><span className={`num ${cls(w.sa)}`}>{w.sa.toFixed(2)}</span></div>
              <span className="vs">vs</span>
              <div className="side right"><Crest tag={b.tag} spec={b.crest} size={22} /><span className="num">{b.tag}</span><span className={`num ${cls(w.sb)}`}>{w.sb.toFixed(2)}</span></div>
            </div>
            <div className="lbl" style={{ marginTop: 7 }}>{win ? `${win.tag} took the war` : 'settled'} · {ago(w.settledAt)}</div>
          </div>
        )
      })}
    </>
  )
}

/* ================= Bounties ================= */
export function Bounties({ toast }) {
  const { bounties, signedIn, postBounty, claimBounty, releaseBounty, me } = useWorld()
  const [busy, run] = useAction(toast)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'Recruiting', title: '', reward: '0.01' })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 12px' }}>
        <span className="lbl">Recruiting, crest art, trading, open calls</span>
        <button className="btn small solid" disabled={!signedIn} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Post'}
        </button>
      </div>

      {open && (
        <div className="coindeploy live" style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="field"><span className="lbl">Kind</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {['Recruiting', 'Crest art', 'Trading', 'Open call', 'Research'].map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">What you want done</span>
              <textarea value={form.title} maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Bring three wallets with positive 30 day PnL into the clan." />
            </label>
            <label className="field"><span className="lbl">Reward in {CHAIN.gas}</span>
              <input value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
            </label>
            <button className="btn small solid" disabled={busy || form.title.trim().length < 8}
              onClick={() => run(
                async () => { await postBounty({ kind: form.kind, title: form.title, reward: Number(form.reward) }); setForm({ ...form, title: '' }); setOpen(false) },
                'Bounty posted'
              )}>
              Post the bounty
            </button>
            <p className="empty-copy" style={{ margin: 0 }}>
              Payment is wallet to wallet in {CHAIN.gas}. Clans.team is not an escrow and never holds it.
            </p>
          </div>
        </div>
      )}

      {bounties.length === 0 && (
        <Empty
          title="The board is empty"
          copy={`Post anything you will pay for — wallets recruited, crest art, research — and pay the claimer directly in ${CHAIN.gas}.`}
        />
      )}
      {bounties.map((b) => (
        <div className={`bountyrow ${b.state !== 'open' ? 'done' : ''}`} key={b.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="lbl on">{b.kind}</span>
              {b.clan && <span className="coin-chip">[{b.clan.toUpperCase()}]</span>}
              <span className="lbl">{ago(b.createdAt)}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-feed)', fontSize: 13.5 }}>{b.title}</div>
            <div className="lbl" style={{ marginTop: 5 }}>
              By {shortAddr(b.by)}{b.claimedBy ? ` · claimed by ${shortAddr(b.claimedBy)}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num gold" style={{ fontSize: 13 }}>{b.reward} {CHAIN.gas}</div>
            {b.state === 'open' && b.by !== me?.address && (
              <button className="btn small" style={{ marginTop: 7 }} disabled={busy || !signedIn}
                onClick={() => run(() => claimBounty(b.id), 'Claimed')}>Claim</button>
            )}
            {b.state === 'claimed' && b.by === me?.address && (
              <button className="btn small" style={{ marginTop: 7 }} disabled={busy}
                onClick={() => run(() => releaseBounty(b.id), 'Marked paid')}>Mark paid</button>
            )}
            {(b.state !== 'open' && b.by !== me?.address) && <div className="lbl" style={{ marginTop: 9 }}>{b.state}</div>}
          </div>
        </div>
      ))}
    </>
  )
}

/* ================= Token ================= */
export function Token() {
  const { clans } = useWorld()
  const live = clans.filter((c) => c.coin)
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
        <div className="stat"><span className="lbl">Chain</span><span className="v">{CHAIN.short} · {CHAIN.id}</span></div>
        <div className="stat"><span className="lbl">Launchpad</span><span className="v">{LAUNCHPAD.name}</span></div>
        <div className="stat"><span className="lbl">Supply</span><span className="v">Fixed</span></div>
      </div>

      <div className="kv">
        <div className="kv-row">
          <span className="lbl">Contract</span>
          <span className="num faint">{TOKEN.address || 'not deployed yet'}</span>
        </div>
        <div className="kv-row">
          <span className="lbl">Deployer wallet</span>
          <span className="chip" style={{ margin: 0 }}>
            <a className="addr" href={`${CHAIN.explorer}/address/${DEV_WALLET}`} target="_blank" rel="noreferrer noopener" title={DEV_WALLET}>{shortAddr(DEV_WALLET)}</a>
            <button className="cta" onClick={() => navigator.clipboard?.writeText(DEV_WALLET)}>Copy</button>
          </span>
        </div>
      </div>

      <div className="doc">
        <h3>The official coin</h3>
        <p>
          ${TOKEN.symbol} is the house coin of this world. It deploys on <b>{LAUNCHPAD.name}</b>, the
          launchpad native to <b>{CHAIN.name}</b>: fixed supply, liquidity locked, non custodial. Until
          it is live there is no contract address — anything claiming to be ${TOKEN.symbol} before it
          appears here is not ours.
        </p>
        <h3>Clan coins</h3>
        <p>
          Every clan Leader can register the coin they deployed on {LAUNCHPAD.name}. Each trade accrues
          creator fees to that coin's own on chain vault. Clans.team never holds or distributes any of
          it: the vault belongs to the coin's creator wallet.
        </p>
      </div>

      <div className="lbl" style={{ padding: '18px 0 4px' }}>Clan coins live</div>
      {live.length === 0 && (
        <Empty title="No clan coin registered" copy={`The first Leader to launch one on ${LAUNCHPAD.name} shows up here.`} />
      )}
      {live.map((c) => (
        <a className="coinrow" key={c.id} href={`${CHAIN.explorer}/token/${c.coin.address}`} target="_blank" rel="noreferrer noopener">
          <Crest tag={c.tag} spec={c.crest} size={32} />
          <div className="lb-name">
            <div className="n">${c.coin.symbol}</div>
            <div className="t">{c.name} · {shortAddr(c.coin.address)}</div>
          </div>
          <div className="lb-val num faint">on {CHAIN.short}</div>
          <span className="faint">&#8250;</span>
        </a>
      ))}

      <div className="chainrow">
        <a className="btn small" href={LAUNCHPAD.site} target="_blank" rel="noreferrer noopener">Open {LAUNCHPAD.name}</a>
        <a className="btn small" href={CHAIN.docs} target="_blank" rel="noreferrer noopener">{CHAIN.name} docs</a>
      </div>
    </>
  )
}

/* ================= Found a clan ================= */
export function Found({ toast, capital, pickMode, onPickCapital, go }) {
  const { foundClan, signedIn, me, clans, stats } = useWorld()
  const [busy, run] = useAction(toast)
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [entry, setEntry] = useState('public')
  const [region, setRegion] = useState('Worldwide')
  const [motto, setMotto] = useState('')
  const [spec, setSpec] = useState(() => randomCrest('SEED'))
  const set = (k) => (v) => setSpec((s) => ({ ...s, [k]: v }))
  const taken = clans.some((c) => c.tag === tag)
  const ready = signedIn && !me?.clan && name.trim().length >= 3 && /^[A-Z0-9]{3,6}$/.test(tag) && !taken && capital

  if (me?.clan) {
    return (
      <Empty
        title="You already hold a banner"
        copy="One wallet, one clan. Leave your current clan before founding another."
        action="Open my clan"
        onAction={() => go('clan', me.clan.id)}
      />
    )
  }

  return (
    <>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '4px 0 16px' }}>
        Up to {CLAN_MAX} wallets under one crest. You start with 6 tiles for the banner and take 3 more
        for every wallet that joins. {stats.totalTiles - stats.takenTiles} tiles are still open.
      </p>

      <div className="sd-grid">
        <div>
          <Crest tag={tag || 'NEW'} spec={spec} size={172} />
          <div style={{ marginTop: 12 }}>
            <div className="num" style={{ fontWeight: 600 }}>{name || 'Unnamed clan'}</div>
            <span className="lbl">[{tag || '----'}] · {ENTRY_LABEL[entry]}</span>
          </div>
          <button className="btn small ghost" style={{ marginTop: 10 }}
            onClick={() => setSpec(randomCrest(Math.random().toString(36)))}>Shuffle crest</button>
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
            <span className="lbl">Second ink</span>
            <div className="sd-opts">
              {CREST_INKS.map((i) => (
                <button key={i} className={`swatch ${spec.ink2 === i ? 'on' : ''}`} onClick={() => set('ink2')(i)}>
                  <span style={{ background: i }} />
                </button>
              ))}
            </div>
          </div>
          <div className="sd-row">
            <span className="lbl">Emblem colour</span>
            <div className="sd-opts">
              <button className={`swatch ${(spec.chargeInk ?? 'auto') === 'auto' ? 'on' : ''}`}
                onClick={() => set('chargeInk')('auto')} title="Pick whatever reads best">
                <span style={{ background: 'linear-gradient(135deg,#f4f1ec 50%,#08090b 50%)' }} />
              </button>
              {CREST_INKS.map((i) => (
                <button key={i} className={`swatch ${spec.chargeInk === i ? 'on' : ''}`} onClick={() => set('chargeInk')(i)}>
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
          <div className="sd-row">
            <span className="lbl">Emblem size</span>
            <input className="slider" type="range" min="0.6" max="1.4" step="0.05"
              value={spec.scale ?? 1} onChange={(e) => set('scale')(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <hr className="hr" style={{ margin: '18px 0' }} />

      <div style={{ display: 'grid', gap: 16 }}>
        <label className="field"><span className="lbl">Clan name</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Ember Court" />
        </label>
        <label className="field">
          <span className="lbl">Tag {taken && <span className="down">· already taken</span>}</span>
          <input value={tag} maxLength={6} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="EMBR" />
        </label>
        <div className="field">
          <span className="lbl">Who can join</span>
          <div className="pickrow">
            <button className={`pick ${entry === 'public' ? 'on' : ''}`} onClick={() => setEntry('public')}>
              <b>Public</b>
              <span>Anyone joins straight away.</span>
            </button>
            <button className={`pick ${entry === 'private' ? 'on' : ''}`} onClick={() => setEntry('private')}>
              <b>Private</b>
              <span>People ask, and you approve each one.</span>
            </button>
          </div>
        </div>
        <label className="field">
          <span className="lbl">Motto · flies on your flag</span>
          <input value={motto} maxLength={60} onChange={(e) => setMotto(e.target.value)} placeholder="Nobody wins alone." />
        </label>
        <label className="field"><span className="lbl">Region</span>
          <input value={region} maxLength={40} onChange={(e) => setRegion(e.target.value)} />
        </label>

        <div className="field">
          <span className="lbl">Capital</span>
          <div className="chainrow" style={{ marginTop: 0 }}>
            <button className={`btn small ${pickMode ? 'solid' : ''}`} onClick={onPickCapital}>
              {pickMode ? 'Click the globe…' : capital ? 'Move capital' : 'Pick on the globe'}
            </button>
            <span className="num faint" style={{ fontSize: 12.5 }}>
              {capital ? `${capital[0].toFixed(2)}°, ${capital[1].toFixed(2)}°` : 'nothing picked'}
            </span>
          </div>
        </div>
      </div>

      <div className="chainrow" style={{ marginTop: 20 }}>
        <button className="btn solid" disabled={!ready || busy}
          onClick={() => run(
            () => foundClan({ name, tag, entry, region, motto, lang: 'English', crest: spec, cap: capital }),
            `${tag} founded`
          )}>
          {busy ? 'Founding…' : 'Found the clan'}
        </button>
        <Chain />
      </div>
      {!signedIn && <p className="empty-copy" style={{ marginTop: 10 }}>Connect a wallet first — founding is signed by you.</p>}
    </>
  )
}

/* The clan coin, launched for real on Pons. The wallet signs it and pays
   the fee; this site never touches the money and only records the receipt. */
function LaunchCoin({ clan, toast }) {
  const { registerCoin } = useWorld()
  const [pre, setPre] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(null)
  const [form, setForm] = useState({ logo: '', description: '', website: '', twitter: '', telegram: '' })

  useEffect(() => {
    let alive = true
    launchPreflight().then((p) => alive && setPre(p)).catch(() => alive && setPre({ error: true }))
    return () => { alive = false }
  }, [])

  const launch = async () => {
    setBusy(true)
    try {
      setStep('Confirm in your wallet…')
      const hash = await launchClanCoin({
        clan,
        logo: form.logo.trim(),
        description: form.description.trim(),
        links: { website: form.website.trim(), twitter: form.twitter.trim(), telegram: form.telegram.trim() },
      })
      setStep('Launched. Recording it…')
      await registerCoin(clan.id, hash)
      toast(`$${clan.tag} is live on ${LAUNCHPAD.name}`)
      setOpen(false)
    } catch (e) {
      toast(e?.shortMessage || e?.message || 'the launch did not go through')
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  return (
    <div className="coindeploy">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <span className="lbl on">Launch the clan coin</span>
          <div className="lbl" style={{ marginTop: 4 }}>
            ${clan.tag} on {LAUNCHPAD.name}
            {pre && !pre.error && ` · fee ${pre.feeEth} ${CHAIN.gas} · graduates at ${pre.graduationEth} ${CHAIN.gas}`}
          </div>
        </div>
        <button className="btn small solid" disabled={busy || (pre && !pre.error && !pre.enabled)}
          onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Launch'}
        </button>
      </div>

      {pre?.error && <p className="empty-copy" style={{ marginTop: 8 }}>Cannot reach {CHAIN.name} right now.</p>}
      {pre && !pre.error && !pre.enabled && (
        <p className="empty-copy" style={{ marginTop: 8 }}>{LAUNCHPAD.name} has launching switched off at the moment.</p>
      )}

      {open && (
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <div className="kv-row" style={{ borderTop: '1px solid var(--line2)' }}>
            <span className="lbl">Name / symbol</span>
            <span className="num">{clan.name} · ${clan.tag}</span>
          </div>
          <label className="field"><span className="lbl">Logo URL</span>
            <input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} placeholder="https://…" />
          </label>
          <label className="field"><span className="lbl">Description</span>
            <textarea value={form.description} maxLength={280}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={`${clan.name} — a clan on clans.team.`} />
          </label>
          <label className="field"><span className="lbl">Website</span>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://clans.team" />
          </label>
          <label className="field"><span className="lbl">X / Twitter</span>
            <input value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} placeholder="https://x.com/…" />
          </label>
          <label className="field"><span className="lbl">Telegram</span>
            <input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} placeholder="https://t.me/…" />
          </label>

          <p className="empty-copy" style={{ margin: 0 }}>
            You sign the transaction and you pay the {pre?.feeEth ?? '—'} {CHAIN.gas} fee plus gas.
            Creator fees go to your wallet, not to us. We check the call would succeed before your
            wallet opens, so a launch that cannot work never costs you anything.
          </p>

          <button className="btn solid" disabled={busy} onClick={launch}>
            {busy ? (step || 'Working…') : `Launch $${clan.tag} on ${LAUNCHPAD.name}`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ================= Clan detail ================= */
export function ClanDetail({ id, toast, focus, go }) {
  const world = useWorld()
  const { clanBy, me, myRole, signedIn, joinClan, leaveClan, wars, acceptMember, declineMember, setRole } = world
  const c = clanBy(id)
  const [tab, setTab] = useState('roster')
  const [busy, run] = useAction(toast)
  const mine = me?.clan?.id === id
  const canManage = mine && ['leader', 'coleader', 'elder'].includes(myRole)
  const history = useMemo(() => wars.filter((w) => w.a === id || w.b === id), [wars, id])

  if (!c) return <Empty title="That clan is gone" copy="It disbanded, or it never existed." action="Open the directory" onAction={() => go('directory')} />

  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', margin: '4px 0 14px' }}>
        <Crest tag={c.tag} spec={c.crest} size={78} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="num" style={{ fontSize: 19, fontWeight: 600 }}>{c.name}<span className="lvlchip big">LVL {c.lvl}</span></div>
          <span className="lbl">[{c.tag}] · {c.members} of {CLAN_MAX} · {ENTRY_LABEL[c.entry]} · {c.region}</span>
          {c.motto && <div className="clanmotto">“{c.motto}”</div>}
          <div className="xpbar"><div className="fill" style={{ width: `${Math.round((c.xpInLevel / Math.max(1, c.xpToNext)) * 100)}%` }} /></div>
          <div className="lbl" style={{ marginTop: 6 }}>{c.xpInLevel} / {c.xpToNext} xp to level {c.lvl + 1}</div>
        </div>
      </div>

      <div className="statrow" style={{ paddingTop: 6 }}>
        <div className="stat"><span className="lbl">Trophies</span><span className="v gold">{c.trophies}</span></div>
        <div className="stat"><span className="lbl">Land</span><span className="v">{c.land}</span></div>
        <div className="stat"><span className="lbl">Record</span><span className="v">{c.wins}W {c.losses}L</span></div>
        <div className="stat"><span className="lbl">Profit</span><span className={`v ${cls(c.pnl)}`}>{eth(c.pnl)}</span></div>
      </div>

      {c.coin ? (
        <div className="coindeploy live">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div className="num" style={{ fontWeight: 600 }}>${c.coin.symbol}</div>
              <span className="lbl">On {LAUNCHPAD.name} · {shortAddr(c.coin.address)}{c.coin.curve ? ` · curve ${shortAddr(c.coin.curve)}` : ''}</span>
            </div>
            <a className="btn small" href={`${CHAIN.explorer}/token/${c.coin.address}`} target="_blank" rel="noreferrer noopener">View</a>
          </div>
        </div>
      ) : mine && myRole === 'leader' ? (
        <LaunchCoin clan={c} toast={toast} />
      ) : (
        <div className="coindeploy">
          <span className="lbl on">No clan coin yet</span>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>The Leader can launch one on {LAUNCHPAD.name} straight from this page.</p>
        </div>
      )}

      <div className="chainrow" style={{ marginBottom: 8 }}>
        {!mine && (
          <button className="btn small solid" disabled={busy || !signedIn || !!me?.clan}
            onClick={() => run(() => joinClan(c.id), isPublic(c) ? `Joined ${c.tag}` : `Asked to join ${c.tag}`)}>
            {isPublic(c) ? 'Join clan' : 'Ask to join'}
          </button>
        )}
        {mine && (
          <button className="btn small danger" disabled={busy}
            onClick={() => run(() => leaveClan(c.id), `Left ${c.tag}`)}>Leave clan</button>
        )}
        <button className="btn small" onClick={() => focus([c.cap[0], c.cap[1], 1.9])}>Show capital</button>
      </div>

      <div className="seg" style={{ margin: '10px 0 4px' }}>
        {[['roster', 'Roster'], ['land', 'Land'], ['wars', 'Wars']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'roster' && canManage && c.requests?.length > 0 && (
        <>
          <div className="rolehead">Waiting to join · {c.requests.length}</div>
          {c.requests.map((r) => (
            <div className="member" key={r.address}>
              <div>
                <span>{r.handle}</span>
                <span className="lbl" style={{ marginLeft: 8 }}>{shortAddr(r.address)} · {ago(r.at)}</span>
              </div>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="btn small solid" disabled={busy}
                  onClick={() => run(() => acceptMember(c.id, r.address), `${r.handle} is in`)}>Accept</button>
                <button className="btn small ghost" disabled={busy}
                  onClick={() => run(() => declineMember(c.id, r.address), 'Declined')}>Decline</button>
              </span>
            </div>
          ))}
        </>
      )}

      {tab === 'roster' && mine && !canManage && c.entry === 'private' && (
        <p className="empty-copy" style={{ padding: '14px 0 0' }}>
          Only the Leader, Co Leaders and Elders see who is waiting to join.
        </p>
      )}

      {tab === 'roster' && ['leader', 'coleader', 'elder', 'member'].map((role) => {
        const rows = c.roster.filter((m) => m.role === role)
        if (!rows.length) return null
        return (
          <div key={role}>
            <div className="rolehead">{ROLE_LABEL[role]}</div>
            {rows.map((m) => (
              <div className="member" key={m.address}>
                <div>
                  <span>{m.handle}</span>
                  <a className="lbl" style={{ marginLeft: 8 }} href={`${CHAIN.explorer}/address/${m.address}`} target="_blank" rel="noreferrer noopener">{shortAddr(m.address)}</a>
                  <span className={`num ${cls(m.pnl)}`} style={{ marginLeft: 10, fontSize: 12 }}>{eth(m.pnl)}</span>
                </div>
                {myRole === 'leader' && m.role !== 'leader' ? (
                  <select
                    className="rankpick"
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => run(() => setRole(c.id, m.address, e.target.value), 'Rank changed')}
                  >
                    <option value="member">Member</option>
                    <option value="elder">Elder</option>
                    <option value="coleader">Co Leader</option>
                    <option value="leader">Hand over the clan</option>
                  </select>
                ) : (
                  <span className="lbl">{ago(m.joinedAt)}</span>
                )}
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

      {tab === 'wars' && (history.length === 0
        ? <Empty title="No wars yet" copy="This clan has never taken the field." />
        : history.map((w) => {
          const other = clanBy(w.a === c.id ? w.b : w.a)
          const won = w.winner === c.id
          return (
            <div className="member" key={w.id}>
              <div><span className="num">vs {other?.tag ?? '—'}</span> <span className="lbl" style={{ marginLeft: 8 }}>{w.settledAt ? ago(w.settledAt) : `ends in ${countdown(w.endsAt)}`}</span></div>
              <span className={!w.settledAt ? 'acc' : won ? 'up' : 'down'}>{!w.settledAt ? 'Live' : won ? 'Won' : 'Lost'}</span>
            </div>
          )
        }))}
    </>
  )
}

/* ================= Rules ================= */
export function Rules() {
  const { stats } = useWorld()
  return (
    <div className="doc">
      <h3>SocialFi</h3>
      <p>
        Clans.team is the world of SocialFi on <b>{CHAIN.name}</b>: social trading as a competitive
        game, run by the community. Nobody wins it alone. Wallets form clans, clans take land, clan
        coins launched on <b>{LAUNCHPAD.name}</b> earn the creator rewards, wars settle the rest.
      </p>
      <h3>Clans</h3>
      <p>
        Up to {CLAN_MAX} wallets under one crest: a Leader, Co Leaders, Elders and Members. A clan is
        public, so anyone walks in, or private, so the Leader, Co Leaders and Elders approve each
        wallet that asks. One wallet holds one banner at a time, and only the Leader hands out ranks.
      </p>
      <h3>Land</h3>
      <p>
        The map is the prize and it is shared. Every clan holds 6 tiles for the banner plus 3 per
        member, painted around the capital it planted. The world has {stats.totalTiles || WORLD_TILES} tiles
        and no more. A capital cannot be planted on ground another clan already holds, and when the
        tiles run out war is the only way to grow.
      </p>
      <h3>Creator rewards</h3>
      <p>
        Creator rewards come from the clan coin. When the Leader deploys it on <b>{LAUNCHPAD.name}</b>,
        every trade accrues creator fees to the coin's own on chain vault, paid by {LAUNCHPAD.name}
        itself. Clans.team never holds or distributes any of it: the vault belongs to the coin's
        creator wallet, and how a clan shares it is the clan's business.
      </p>
      <h3>Wars</h3>
      <p>
        The Leader and Co Leaders declare timed wars. More profit wins: the clan whose wallets print
        more real {CHAIN.gas} on {CHAIN.name} during the window takes the win, a fifth of the loser's
        land, and trophies scaled by the margin. There is always a winner; a tie holds for the
        defender. Wars settle themselves the moment the clock runs out.
      </p>
      <h3>Levels</h3>
      <p>
        Wars won and wallets recruited earn clan XP; levels follow from XP. Every wallet that joins
        also widens the clan's border by three tiles, and every wallet that leaves gives them back.
      </p>
      <h3>Bounties</h3>
      <p>
        The marketplace. Anyone posts a bounty and anyone else can claim it. Payment is wallet to
        wallet in {CHAIN.gas}. Clans.team is not an escrow and never touches the money.
      </p>
      <h3>Signing in</h3>
      <p>
        You sign a plain message with your wallet to prove the address is yours. It costs no gas,
        moves nothing, and grants no access to your funds. Every action you take is recorded against
        that address, and everyone sees the same world.
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
        Connecting a wallet, founding or joining a clan, posting or claiming a bounty, or otherwise
        interacting with this site means you accept these terms in full. If you do not accept them,
        you may watch, but do not connect or interact.
      </p>
      <h3>2. What Clans.team is</h3>
      <p>
        Clans.team is an interface and a scoreboard. It organises wallets into clans around public{' '}
        {CHAIN.name} and {LAUNCHPAD.name} activity: land, wars, trophies, levels and bounties. It is a
        game layer. It is not an exchange, a broker, a wallet, an investment platform, or an issuer of
        anything.
      </p>
      <h3>3. Not affiliated</h3>
      <p>
        Clans.team is not affiliated with, endorsed by, or operated by Robinhood Markets, {CHAIN.name},{' '}
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
        Your wallet stays yours at all times. Clans.team never takes custody of funds, never holds
        keys, and never moves anything on your behalf. Signing in signs a plain text message, not a
        transaction.
      </p>
      <h3>6. No financial advice</h3>
      <p>
        Nothing here is investment, financial, legal or tax advice. Scores, leaderboards and trophies
        are informational and can be wrong, late, or incomplete. Trading tokens can lose you
        everything you put in.
      </p>
      <h3>7. Bounties and rewards</h3>
      <p>
        Bounties are agreements between the people who post and claim them. Payment happens wallet to
        wallet and Clans.team is not an escrow, guarantor or arbitrator. Creator rewards accrue to a
        coin's own vault on {LAUNCHPAD.name}; we neither hold nor route them.
      </p>
      <h3>8. Conduct</h3>
      <p>
        No illegal content, no impersonation, no harassment. We may remove a clan or a wallet from the
        interface at any time.
      </p>
      <h3>9. Availability</h3>
      <p>
        The site is provided as is, with no warranty of any kind. Rules and figures can change without
        notice.
      </p>
      <h3>10. Changes</h3>
      <p>Continued use after any update to these terms is acceptance of the update.</p>
    </div>
  )
}
