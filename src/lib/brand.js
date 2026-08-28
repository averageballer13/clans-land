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

export const SITE = {
  name: 'Clans',
  tld: '.land',
  domain: 'clans.land',
}

export const TOKEN = {
  symbol: 'CLANS',
  name: 'Clans.land',
  // Not deployed yet — the launch happens on Pons.
  address: null,
  url: LAUNCHPAD.site,
}

// The wallet that deploys $CLANS and holds the creator vault on Pons.
export const DEV_WALLET = '0x3690589E41C7705AC65BD456202fe936B55420A0'
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')

export const WALLETS = [
  { id: 'metamask', name: 'MetaMask', logo: '/brand/wallet/metamask.jpg' },
  { id: 'rabby', name: 'Rabby', logo: '/brand/wallet/rabby.png' },
  { id: 'coinbase', name: 'Coinbase Wallet', logo: '/brand/wallet/coinbase.jpg' },
  { id: 'walletconnect', name: 'WalletConnect', logo: '/brand/wallet/walletconnect.png' },
]

export const WORLD_TILES = 1200
export const CLAN_MAX = 50
