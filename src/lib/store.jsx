import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { connect as connectWallet, signMessage } from './wallet.js'

const TOKEN_KEY = 'clans.session'
const Ctx = createContext(null)

/* Same origin by default. Set VITE_API_URL when the site and the API are
   served from different places. */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const apiUrl = (path) => API_BASE + path

class Unreachable extends Error {
  constructor(url, why) {
    super(`The game server is not answering at ${url}. ${why}`)
    this.unreachable = true
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const url = apiUrl(path)
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Unreachable(url, 'Nothing is listening there.')
  }

  // A 404 from our own API means this page reached a web server that does not
  // carry the game — almost always the site without its API behind it.
  if (res.status === 404) throw new Unreachable(url, 'That address serves the site but not the game.')

  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  if (!res.ok) throw new Error(json?.error || `Something went wrong (${res.status})`)
  return json
}

const EMPTY = {
  clans: [], tiles: [], wars: [], bounties: [], events: [],
  stats: { totalTiles: 0, takenTiles: 0, claimedPct: 0, clans: 0, wallets: 0, liveWars: 0, openBounties: 0 },
}

/* Rendering outside the provider should degrade to an empty world, never to a
   blank page. */
const noop = async () => { throw new Error('The world is not loaded yet.') }
const FALLBACK = {
  ...EMPTY,
  status: 'loading', me: null, signedIn: false,
  signIn: noop, signOut: noop, refresh: noop, toast: () => {},
  clanBy: () => null, myClan: null, myRole: null,
  foundClan: noop, joinClan: noop, acceptMember: noop, declineMember: noop,
  setRole: noop, leaveClan: noop, registerCoin: noop, declareWar: noop,
  postBounty: noop, claimBounty: noop, releaseBounty: noop,
}

export const useWorld = () => useContext(Ctx) ?? FALLBACK

export function WorldProvider({ children, onToast }) {
  const [world, setWorld] = useState(EMPTY)
  const [me, setMe] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null)
  const [status, setStatus] = useState('loading') // loading | live | offline
  const tokenRef = useRef(token)
  tokenRef.current = token

  const refresh = useCallback(async () => {
    try {
      const w = await call('/api/world')
      setWorld(w)
      setStatus('live')
      return true
    } catch {
      setStatus('offline')
      return false
    }
  }, [])

  const refreshMe = useCallback(async () => {
    if (!tokenRef.current) { setMe(null); return }
    try {
      setMe(await call('/api/me', { token: tokenRef.current }))
    } catch {
      // The session died on the server; drop it rather than pretend.
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setMe(null)
    }
  }, [])

  useEffect(() => { refresh(); refreshMe() }, [refresh, refreshMe])
  useEffect(() => { refreshMe() }, [token, refreshMe])

  /* Live updates.

     Where the server is a long-lived process it pushes a version down an
     event stream. Where it is serverless it cannot hold one open, so we poll
     a one-field version endpoint instead and only refetch the world when the
     number actually moves. /api/health says which. */
  useEffect(() => {
    let source
    let poll
    let stopped = false
    let seen = 0

    const pull = async () => {
      try {
        const { v } = await call('/api/version')
        if (v !== seen) { seen = v; await refresh() }
        else setStatus('live')
      } catch {
        setStatus('offline')
      }
    }

    ;(async () => {
      let stream = false
      try { stream = (await call('/api/health')).stream === true } catch { /* poll anyway */ }
      if (stopped) return

      if (stream) {
        try {
          source = new EventSource(apiUrl('/api/stream'))
          source.onmessage = (e) => {
            try { seen = JSON.parse(e.data).v } catch { /* still refresh */ }
            refresh()
          }
        } catch { /* the poll below covers it */ }
      }
      // Polling runs either way: it is what brings the world back after the
      // server restarts, without anyone reloading the page.
      poll = setInterval(pull, stream ? 15000 : 5000)
    })()

    return () => { stopped = true; source?.close(); if (poll) clearInterval(poll) }
  }, [refresh])

  /* ---- session ---- */
  const signIn = useCallback(async (walletId) => {
    const { provider, address } = await connectWallet(walletId)
    const { nonce, message } = await call(`/api/auth/nonce?address=${address}`)
    const signature = await signMessage(provider, address, message)
    const session = await call('/api/auth/verify', { method: 'POST', body: { address, nonce, signature } })
    localStorage.setItem(TOKEN_KEY, session.token)
    setToken(session.token)
    return session
  }, [])

  const signOut = useCallback(async () => {
    if (tokenRef.current) { try { await call('/api/auth/logout', { method: 'POST', token: tokenRef.current }) } catch { /* already gone */ } }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setMe(null)
  }, [])

  /* ---- actions. Every one goes through the server, so the result is the
     same for everybody looking at the map. ---- */
  const act = useCallback(async (path, body, method = 'POST') => {
    if (!tokenRef.current) throw new Error('Connect your wallet first.')
    const out = await call(path, { method, body, token: tokenRef.current })
    await Promise.all([refresh(), refreshMe()])
    return out
  }, [refresh, refreshMe])

  const api = useMemo(() => ({
    foundClan: (payload) => act('/api/clans', payload),
    joinClan: (id) => act(`/api/clans/${id}/join`),
    acceptMember: (id, address) => act(`/api/clans/${id}/accept`, { address }),
    declineMember: (id, address) => act(`/api/clans/${id}/decline`, { address }),
    setRole: (id, address, role) => act(`/api/clans/${id}/role`, { address, role }),
    leaveClan: (id) => act(`/api/clans/${id}/leave`),
    registerCoin: (id, txHash) => act(`/api/clans/${id}/coin`, { txHash }),
    declareWar: (target, hours) => act('/api/wars', { target, hours }),
    postBounty: (payload) => act('/api/bounties', payload),
    claimBounty: (id) => act(`/api/bounties/${id}/claim`),
    releaseBounty: (id) => act(`/api/bounties/${id}/release`),
  }), [act])

  const value = useMemo(() => ({
    ...world,
    status,
    me,
    signedIn: !!token && !!me,
    signIn,
    signOut,
    refresh,
    toast: onToast,
    clanBy: (id) => world.clans.find((c) => c.id === id) || null,
    myClan: me?.clan ? world.clans.find((c) => c.id === me.clan.id) || null : null,
    myRole: me?.clan?.role ?? null,
    ...api,
  }), [world, status, me, token, signIn, signOut, refresh, api, onToast])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
