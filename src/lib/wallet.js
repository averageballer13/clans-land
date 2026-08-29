import { CHAIN } from './brand.js'

/* Wallet discovery and plumbing.

   Wallets announce themselves over EIP-6963, which is how a modern connect
   sheet knows a name, an icon and whether something is actually installed —
   instead of fighting over the single window.ethereum slot. Anything older
   still shows up through that slot as a fallback. */

const KNOWN = [
  { rdns: 'io.metamask', name: 'MetaMask', url: 'https://metamask.io/download/' },
  { rdns: 'io.rabby', name: 'Rabby Wallet', url: 'https://rabby.io/' },
  { rdns: 'app.phantom', name: 'Phantom', url: 'https://phantom.com/download' },
  { rdns: 'com.brave.wallet', name: 'Brave Wallet', url: 'https://brave.com/wallet/' },
  { rdns: 'com.trustwallet.app', name: 'Trust Wallet', url: 'https://trustwallet.com/download' },
  { rdns: 'com.coinbase.wallet', name: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet/downloads' },
  { rdns: 'com.okex.wallet', name: 'OKX Wallet', url: 'https://www.okx.com/web3' },
  { rdns: 'com.bitget.web3', name: 'Bitget Wallet', url: 'https://web3.bitget.com/' },
  { rdns: 'xyz.frontier.wallet', name: 'Frontier', url: 'https://www.frontier.xyz/download' },
  { rdns: 'me.rainbow', name: 'Rainbow', url: 'https://rainbow.me/download' },
  { rdns: 'com.zerion.wallet', name: 'Zerion', url: 'https://zerion.io/download' },
  { rdns: 'io.zeal', name: 'Zeal', url: 'https://zeal.app/' },
]

const found = new Map() // rdns -> { info, provider }
let listening = false

function startDiscovery() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('eip6963:announceProvider', (e) => {
    const { info, provider } = e.detail || {}
    if (info?.rdns && provider) found.set(info.rdns, { info, provider })
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
}
startDiscovery()

/* Ask again and give wallets a moment to answer — some announce late. */
export function discover(waitMs = 350) {
  startDiscovery()
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return new Promise((resolve) => setTimeout(() => resolve(installed()), waitMs))
}

function legacy() {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  if (!eth) return []
  const list = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth]
  return list.map((p, i) => ({
    id: `legacy:${i}`,
    name: p.isRabby ? 'Rabby Wallet'
      : p.isCoinbaseWallet ? 'Coinbase Wallet'
        : p.isPhantom ? 'Phantom'
          : p.isBraveWallet ? 'Brave Wallet'
            : p.isTrust ? 'Trust Wallet'
              : p.isMetaMask ? 'MetaMask'
                : 'Browser wallet',
    icon: null,
    provider: p,
    installed: true,
  }))
}

export function installed() {
  const byRdns = [...found.values()].map(({ info, provider }) => ({
    id: info.rdns,
    name: info.name,
    icon: info.icon,
    provider,
    installed: true,
  }))
  if (byRdns.length) return byRdns
  // No EIP-6963 announcements: fall back to whatever holds window.ethereum.
  return legacy()
}

/* Everything worth offering: what is installed first, then the rest as
   install links so the sheet is never a dead end. */
export function walletOptions() {
  const live = installed()
  const seen = new Set(live.map((w) => w.name.toLowerCase()))
  const rest = KNOWN
    .filter((k) => !seen.has(k.name.toLowerCase()))
    .map((k) => ({ id: k.rdns, name: k.name, icon: null, provider: null, installed: false, url: k.url }))
  return [...live, ...rest]
}

export const hasWallet = () => installed().length > 0

export function providerFor(id) {
  const live = installed()
  return live.find((w) => w.id === id)?.provider ?? live[0]?.provider ?? null
}

export async function ensureChain(provider) {
  const current = await provider.request({ method: 'eth_chainId' })
  if (String(current).toLowerCase() === CHAIN.hexId) return
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hexId }] })
  } catch (err) {
    // 4902: the wallet has never heard of the chain, so offer to add it.
    const code = err?.code ?? err?.data?.originalError?.code
    if (code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CHAIN.hexId,
          chainName: CHAIN.name,
          nativeCurrency: { name: 'Ether', symbol: CHAIN.gas, decimals: 18 },
          rpcUrls: [CHAIN.rpc],
          blockExplorerUrls: [CHAIN.explorer],
        }],
      })
    } else throw err
  }
}

export async function connect(id) {
  const provider = providerFor(id)
  if (!provider) throw new Error('No wallet found in this browser. Install one, then reload the page.')
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const address = accounts?.[0]
  if (!address) throw new Error('The wallet returned no account.')
  await ensureChain(provider)
  return { provider, address }
}

export async function signMessage(provider, address, message) {
  return provider.request({ method: 'personal_sign', params: [message, address] })
}

export function onAccountsChanged(handler) {
  const list = installed().map((w) => w.provider)
  list.forEach((p) => p?.on?.('accountsChanged', handler))
  return () => list.forEach((p) => p?.removeListener?.('accountsChanged', handler))
}
