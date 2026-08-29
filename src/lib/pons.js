/* Pons V2 on Robinhood Chain (chain 4663).
   Addresses and ABIs verified against the deployed, verified contracts on
   Blockscout — not transcribed from documentation. Shared by the browser
   (which builds and signs the launch) and the server (which verifies it). */

export const PONS = {
  factory: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  launchAndBuy: '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948',
  launchLocker: '0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952',
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

/* Native ETH is the pair token: pass the zero address. */
export const PAIR_TOKEN = ZERO_ADDRESS
export const LAUNCH_CONFIG_ID = 0n

const socials = [
  { name: 'twitter', type: 'string' },
  { name: 'telegram', type: 'string' },
  { name: 'discord', type: 'string' },
  { name: 'website', type: 'string' },
  { name: 'farcaster', type: 'string' },
]

const tokenParams = [
  { name: 'name', type: 'string' },
  { name: 'symbol', type: 'string' },
  { name: 'logo', type: 'string' },
  { name: 'description', type: 'string' },
  { name: 'socials', type: 'tuple', components: socials },
  { name: 'creatorFeeRecipient', type: 'address' },
  { name: 'creatorTaxBps', type: 'uint16' },
  { name: 'buybackEnabled', type: 'bool' },
  { name: 'expectedEconomics', type: 'bytes32' },
  { name: 'salt', type: 'bytes32' },
]

export const factoryAbi = [
  {
    type: 'function', name: 'launchToken', stateMutability: 'payable',
    inputs: [
      { name: 'params', type: 'tuple', components: tokenParams },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
      { name: 'snipeTaxExemptions', type: 'address[]' },
    ],
    outputs: [{ name: 'token', type: 'address' }, { name: 'curve', type: 'address' }],
  },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'launchEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'canLaunch', stateMutability: 'view',
    inputs: [{ name: 'launcher', type: 'address' }], outputs: [{ type: 'bool' }],
  },
  /* The economics pin. Read it immediately before launching and pass it in
     params.expectedEconomics — a zero value reverts with LaunchEconomicsMismatch. */
  {
    type: 'function', name: 'previewLaunchEconomics', stateMutability: 'view',
    inputs: [{ name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function', name: 'getLaunchConfig', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'supply', type: 'uint256' },
        { name: 'curveFeeBps', type: 'uint256' },
        { name: 'phantomQuote', type: 'uint256' },
        { name: 'graduationThreshold', type: 'uint256' },
        { name: 'poolFee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'enabled', type: 'bool' },
      ],
    }],
  },
  {
    type: 'event', name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address', indexed: false },
      { name: 'launchConfigId', type: 'uint256', indexed: false },
      { name: 'graduationThreshold', type: 'uint256', indexed: false },
    ],
  },
]

/* Every trade on a Pons bonding curve. `buyer` / `seller` are indexed, so a
   wallet's whole trading history can be pulled straight from the logs — this
   is what war scores are counted from. */
export const curveEvents = [
  {
    type: 'event', name: 'CurveBuy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'CurveSell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
]

export const erc20Abi = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
]

/* A clan coin is the clan: same name, tag as symbol, and the creator fees go
   to the wallet that launches it. */
export function clanTokenParams({ clan, creator, logo = '', description = '', links = {} }) {
  return {
    name: clan.name,
    symbol: clan.tag,
    logo,
    description: description || `${clan.name} [${clan.tag}] — a clan on clans.land, the world of SocialFi on Robinhood Chain.`,
    socials: {
      twitter: links.twitter || '',
      telegram: links.telegram || '',
      discord: links.discord || '',
      website: links.website || '',
      farcaster: '',
    },
    creatorFeeRecipient: creator,
    creatorTaxBps: 0,
    buybackEnabled: true,
    expectedEconomics: ZERO_BYTES32, // filled in right before signing
    salt: ZERO_BYTES32, // filled in right before signing
  }
}
