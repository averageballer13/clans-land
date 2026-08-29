import { CHAIN } from './brand.js'

/* Real EIP-1193 wallet plumbing. No SDK, no custody, no keys leave the
   wallet: we ask for an account, make sure it is on Robinhood Chain, and
   personal_sign a nonce the server handed us. */

export function providers() {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  if (!eth) return []
  // EIP-5749: several wallets share window.ethereum via `providers`.
  const list = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth]
  return list.map((p) => ({
    provider: p,
    id: p.isRabby ? 'rabby'
      : p.isCoinbaseWallet ? 'coinbase'
        : p.isMetaMask ? 'metamask'
          : 'injected',
    name: p.isRabby ? 'Rabby'
      : p.isCoinbaseWallet ? 'Coinbase Wallet'
        : p.isMetaMask ? 'MetaMask'
          : 'Browser wallet',
  }))
}

export const hasWallet = () => providers().length > 0

export function providerFor(id) {
  const all = providers()
  return all.find((p) => p.id === id)?.provider ?? all[0]?.provider ?? null
}

export async function ensureChain(provider) {
  const current = await provider.request({ method: 'eth_chainId' })
  if (String(current).toLowerCase() === CHAIN.hexId) return
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hexId }] })
  } catch (err) {
    // 4902: the wallet has never heard of the chain, so offer to add it.
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
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
  if (!provider) throw new Error('No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet.')
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
  const list = providers().map((p) => p.provider)
  list.forEach((p) => p.on?.('accountsChanged', handler))
  return () => list.forEach((p) => p.removeListener?.('accountsChanged', handler))
}
