// Real chain / launchpad identity. Logos in /public/brand are the official
// marks pulled from the vendors themselves — nothing here is invented.

export const CHAIN = {
  name: 'Robinhood Chain',
  short: 'RHC',
  // Robinhood Chain is an Arbitrum Orbit L2; gas and trading settle in ETH.
  gas: 'ETH',
  logo: '/brand/robinhood-feather.svg',
  logoDark: '/brand/robinhood-feather-dark.svg',
  site: 'https://robinhood.com/us/en/chain/',
  docs: 'https://docs.robinhood.com/chain/',
  explorer: 'https://explorer.robinhood.com',
}

export const LAUNCHPAD = {
  name: 'Pons',
  handle: '@ponsdotfamily',
  logo: '/brand/pons.png',
  site: 'https://ponslaunchpad.com/',
  // $PONS on Robinhood Chain
  token: '0x39dbed3a2bd333467115de45665cc57f813c4571',
  tokenUrl: 'https://opensea.io/token/robinhood/0x39dbed3a2bd333467115de45665cc57f813c4571',
}

export const TOKEN = {
  symbol: 'CLANS',
  name: 'Pons Clans',
  address: '0x0000000000000000000000000000000000000000',
  url: LAUNCHPAD.site,
}

export const WALLETS = [
  { id: 'metamask', name: 'MetaMask', logo: '/brand/wallet/metamask.jpg' },
  { id: 'rabby', name: 'Rabby', logo: '/brand/wallet/rabby.png' },
  { id: 'coinbase', name: 'Coinbase Wallet', logo: '/brand/wallet/coinbase.jpg' },
  { id: 'walletconnect', name: 'WalletConnect', logo: '/brand/wallet/walletconnect.png' },
]

export const WORLD_TILES = 1200
export const CLAN_MAX = 50
