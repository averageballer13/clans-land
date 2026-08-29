import { createPublicClient, createWalletClient, custom, http, formatEther } from 'viem'
import { CHAIN } from './brand.js'
import { PONS, factoryAbi, clanTokenParams, PAIR_TOKEN, LAUNCH_CONFIG_ID } from './pons.js'
import { connect, ensureChain } from './wallet.js'

const rhc = {
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: { name: 'Ether', symbol: CHAIN.gas, decimals: 18 },
  rpcUrls: { default: { http: [CHAIN.rpc] } },
}

export const publicClient = createPublicClient({ chain: rhc, transport: http(CHAIN.rpc) })

const randomSalt = () => {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return `0x${[...b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/* What the launch would cost and whether it is even open right now. Read
   before showing the button, so nobody is invited to sign a doomed call. */
export async function launchPreflight(address) {
  const [enabled, fee, config] = await Promise.all([
    publicClient.readContract({ address: PONS.factory, abi: factoryAbi, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: PONS.factory, abi: factoryAbi, functionName: 'launchFee' }),
    publicClient.readContract({ address: PONS.factory, abi: factoryAbi, functionName: 'getLaunchConfig', args: [LAUNCH_CONFIG_ID] }),
  ])
  let allowed = true
  if (address) {
    allowed = await publicClient.readContract({
      address: PONS.factory, abi: factoryAbi, functionName: 'canLaunch', args: [address],
    })
  }
  let balance = null
  if (address) balance = await publicClient.getBalance({ address })

  return {
    enabled: Boolean(enabled) && config.enabled,
    allowed: Boolean(allowed),
    fee,
    feeEth: formatEther(fee),
    graduationEth: formatEther(config.graduationThreshold),
    balance,
    enough: balance == null ? null : balance > fee,
  }
}

/* Deploys the clan coin on Pons. The wallet signs it and pays the launch
   fee and the gas — this site never holds anything. The call is simulated
   first, so a launch that would revert never reaches the wallet. */
export async function launchClanCoin({ clan, walletId, logo = '', description = '', links = {} }) {
  const { provider, address } = await connect(walletId)
  await ensureChain(provider)

  const pre = await launchPreflight(address)
  if (!pre.enabled) throw new Error('Pons has launching switched off right now.')
  if (!pre.allowed) throw new Error('This wallet is not allowed to launch on Pons.')
  if (pre.enough === false) throw new Error(`Not enough ${CHAIN.gas}: the launch fee alone is ${pre.feeEth}.`)

  // The economics pin has to be read immediately before the call; a stale or
  // zero value is rejected on chain.
  const expectedEconomics = await publicClient.readContract({
    address: PONS.factory, abi: factoryAbi, functionName: 'previewLaunchEconomics',
    args: [LAUNCH_CONFIG_ID, PAIR_TOKEN],
  })

  const params = {
    ...clanTokenParams({ clan, creator: address, logo, description, links }),
    expectedEconomics,
    salt: randomSalt(),
  }

  const wallet = createWalletClient({ chain: rhc, transport: custom(provider), account: address })

  const { request } = await publicClient.simulateContract({
    account: address,
    address: PONS.factory,
    abi: factoryAbi,
    functionName: 'launchToken',
    args: [params, LAUNCH_CONFIG_ID, PAIR_TOKEN, []],
    value: pre.fee,
  })

  const hash = await wallet.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120000 })
  if (receipt.status !== 'success') throw new Error('The launch transaction failed on chain.')
  return hash
}
