/* Everything this server reads from Robinhood Chain.

   Three jobs:
     - verify that a clan coin really was launched on Pons by the wallet
       that claims it, from the transaction receipt
     - read every trade a wallet has made on a Pons bonding curve
     - value what a wallet still holds, so profit counts the position it is
       sitting on and not only what it has cashed out */

import { createPublicClient, http, parseEventLogs, formatEther, getAddress } from 'viem'
import { PONS, factoryAbi, curveEvents, erc20Abi } from '../src/lib/pons.js'

const RPC = process.env.RHC_RPC || 'https://rpc.mainnet.chain.robinhood.com'
export const CHAIN_ID = 4663

export const client = createPublicClient({
  transport: http(RPC, { batch: true, retryCount: 2, timeout: 20000 }),
})

export const head = () => client.getBlockNumber()

const LAUNCHED = factoryAbi.find((e) => e.type === 'event' && e.name === 'TokenLaunched')
const BUY = curveEvents.find((e) => e.name === 'CurveBuy')
const SELL = curveEvents.find((e) => e.name === 'CurveSell')

const balanceOfAbi = [{
  type: 'function', name: 'balanceOf', stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
}]

const reservesAbi = [
  {
    type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [],
    outputs: [{ name: 'quoteReserve', type: 'uint256' }, { name: 'tokenReserve', type: 'uint256' }],
  },
  { type: 'function', name: 'realQuoteReserve', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

/* ------------------------------------------------------------------
   Launch verification
   ------------------------------------------------------------------ */
export async function verifyLaunch(txHash, expectedDeployer) {
  const receipt = await client.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success') throw new Error('that transaction failed on chain')

  const logs = parseEventLogs({ abi: factoryAbi, eventName: 'TokenLaunched', logs: receipt.logs })
  const mine = logs.find((l) => getAddress(l.address) === getAddress(PONS.factory))
  if (!mine) throw new Error('no Pons launch in that transaction')

  const deployer = getAddress(mine.args.deployer)
  if (deployer !== getAddress(expectedDeployer)) {
    throw new Error('that launch was made by a different wallet')
  }

  const token = getAddress(mine.args.token)
  let symbol = ''
  try {
    symbol = await client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' })
  } catch { /* a token without a readable symbol still counts */ }

  return { token, curve: getAddress(mine.args.curve), symbol, blockNumber: receipt.blockNumber }
}

/* ------------------------------------------------------------------
   Which curves are real.

   Anyone can deploy a contract that emits the same event names, so an
   emitting address only counts once the Pons factory says it launched it.
   The answer also carries the token, which is what a balance is read from.
   ------------------------------------------------------------------ */
const curveCache = new Map()
export async function curveInfo(address) {
  const key = getAddress(address)
  if (curveCache.has(key)) return curveCache.get(key)
  let info = null
  try {
    const logs = await client.getLogs({
      address: PONS.factory, event: LAUNCHED, args: { curve: key },
      fromBlock: 0n, toBlock: 'latest',
    })
    if (logs.length) info = { curve: key, token: getAddress(logs[0].args.token) }
  } catch {
    // If the node refuses the range we must not guess: leave it unproven.
    info = null
  }
  curveCache.set(key, info)
  return info
}

export const isPonsCurve = async (address) => Boolean(await curveInfo(address))

/* ------------------------------------------------------------------
   Trades

   Both curve events carry the trader in an indexed field, so one query
   covers a whole roster. Buys are money out, sells are money in, and the
   pair of them is what a position is measured against.
   ------------------------------------------------------------------ */
const MAX_SPAN = 4000n // blocks per getLogs call

export async function scanTrades(wallets, fromBlock, toBlock) {
  const totals = new Map() // address -> { net, spent, recv, trades }
  const positions = new Map() // `${address}|${curve}` -> { address, curve, token }
  if (!wallets.length || toBlock <= fromBlock) return { totals, positions, scannedTo: fromBlock }

  const touch = (addr) => {
    const k = addr.toLowerCase()
    if (!totals.has(k)) totals.set(k, { net: 0n, spent: 0n, recv: 0n, trades: 0 })
    return totals.get(k)
  }

  let cursor = fromBlock
  while (cursor < toBlock) {
    const end = cursor + MAX_SPAN > toBlock ? toBlock : cursor + MAX_SPAN
    const [buys, sells] = await Promise.all([
      client.getLogs({ event: BUY, args: { buyer: wallets }, fromBlock: cursor, toBlock: end }),
      client.getLogs({ event: SELL, args: { seller: wallets }, fromBlock: cursor, toBlock: end }),
    ])

    for (const log of buys) {
      const info = await curveInfo(log.address)
      if (!info) continue
      const row = touch(log.args.buyer)
      row.net -= log.args.quoteIn
      row.spent += log.args.quoteIn
      row.trades++
      positions.set(`${log.args.buyer.toLowerCase()}|${info.curve}`, { address: log.args.buyer, ...info })
    }
    for (const log of sells) {
      const info = await curveInfo(log.address)
      if (!info) continue
      const row = touch(log.args.seller)
      row.net += log.args.quoteOut
      row.recv += log.args.quoteOut
      row.trades++
      positions.set(`${log.args.seller.toLowerCase()}|${info.curve}`, { address: log.args.seller, ...info })
    }

    cursor = end
  }

  return { totals, positions, scannedTo: toBlock }
}

/* ------------------------------------------------------------------
   What a position is worth right now.

   A wallet that bought and is still holding has spent money and taken
   none back: counting only realised trades reports it as a loss. This
   values the tokens it still holds at what the curve would pay to sell
   them, capped by what the curve can actually pay out.
   ------------------------------------------------------------------ */
export async function valuePosition({ address, token, curve }) {
  const balance = await client.readContract({
    address: token, abi: balanceOfAbi, functionName: 'balanceOf', args: [address],
  })
  if (balance === 0n) return 0n

  const [quoteReserve, tokenReserve] = await client.readContract({
    address: curve, abi: reservesAbi, functionName: 'getReserves',
  })
  if (tokenReserve === 0n) return 0n

  // Constant product: what selling the whole balance would return.
  const out = (quoteReserve * balance) / (tokenReserve + balance)

  let real = out
  try {
    real = await client.readContract({ address: curve, abi: reservesAbi, functionName: 'realQuoteReserve' })
  } catch { /* graduated curves may not expose it */ }
  return out < real ? out : real
}

export const toEth = (wei) => Number(formatEther(wei))
