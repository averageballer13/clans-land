import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { connect as connectWallet, signMessage } from './wallet.js'

const TOKEN_KEY = 'clans.session'
const Ctx = createContext(null)
export const useWorld = () => useContext(Ctx)

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  if (!res.ok) throw new Error(json?.error || `request failed (${res.status})`)
  return json
}

const EMPTY = {
  clans: [], tiles: [], wars: [], bounties: [], events: [],
  stats: { totalTiles: 0, takenTiles: 0, claimedPct: 0, clans: 0, wallets: 0, liveWars: 0, openBounties: 0 },
}

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
    } catch {
      setStatus('offline')
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

  /* Live updates. The server pushes a version bump on every change and we
     refetch, so two browsers never drift apart. Polling covers the case
     where the stream cannot be held open. */
  useEffect(() => {
    let source
    let poll
    try {
      source = new EventSource('/api/stream')
      source.onmessage = () => refresh()
      source.onerror = () => {
        setStatus((s) => (s === 'live' ? 'live' : s))
        if (!poll) poll = setInterval(refresh, 6000)
      }
    } catch {
      poll = setInterval(refresh, 6000)
    }
    return () => { source?.close(); if (poll) clearInterval(poll) }
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
    leaveClan: (id) => act(`/api/clans/${id}/leave`),
    setCoin: (id, symbol, address) => act(`/api/clans/${id}/coin`, { symbol, address }),
    declareWar: (target, hours) => act('/api/wars', { target, hours }),
    reportScore: (id, score) => act(`/api/wars/${id}/score`, { score }),
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
