/* Everything this server reads from Robinhood Chain.

   Two jobs:
     - verify that a clan coin really was launched on Pons by the wallet
       that claims it, from the transaction receipt
     - count war scores from real trades, straight out of the bonding-curve
       logs, so nobody types their own number in */

import { createPublicClient, http, parseEventLogs, formatEther, getAddress } from 'viem'
import { PONS, factoryAbi, curveEvents, erc20Abi } from '../src/lib/pons.js'

const RPC = process.env.RHC_RPC || 'https://rpc.mainnet.chain.robinhood.com'
export const CHAIN_ID = 4663

export const client = createPublicClient({
  transport: http(RPC, { batch: true, retryCount: 2, timeout: 20000 }),
})

export const head = () => client.getBlockNumber()

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

  return {
    token,
    curve: getAddress(mine.args.curve),
    symbol,
    blockNumber: receipt.blockNumber,
  }
}

/* ------------------------------------------------------------------
   War scoring

   CurveBuy and CurveSell carry the trader in an indexed field, so the
   whole roster can be filtered in one query per chunk. A wallet's score
   is what it took out minus what it put in, in ETH.

   Anyone can deploy a contract that emits the same events, so every
   emitting address is checked against a real TokenLaunched from the Pons
   factory before it counts.
   ------------------------------------------------------------------ */
const BUY = curveEvents.find((e) => e.name === 'CurveBuy')
const SELL = curveEvents.find((e) => e.name === 'CurveSell')

const genuineCurve = new Map()
export async function isPonsCurve(address) {
  const key = getAddress(address)
  if (genuineCurve.has(key)) return genuineCurve.get(key)
  let ok = false
  try {
    const logs = await client.getLogs({
      address: PONS.factory,
      event: factoryAbi.find((e) => e.type === 'event' && e.name === 'TokenLaunched'),
      args: { curve: key },
      fromBlock: 0n,
      toBlock: 'latest',
    })
    ok = logs.length > 0
  } catch {
    // If the node refuses the range we must not guess — treat it as unproven.
    ok = false
  }
  genuineCurve.set(key, ok)
  return ok
}

const MAX_SPAN = 4000n // blocks per getLogs call

/* Returns wei deltas keyed by lowercased wallet address. */
export async function scanTrades(wallets, fromBlock, toBlock) {
  const totals = new Map()
  if (!wallets.length || toBlock <= fromBlock) return { totals, scannedTo: fromBlock }

  const add = (addr, wei) => {
    const k = addr.toLowerCase()
    totals.set(k, (totals.get(k) ?? 0n) + wei)
  }

  let cursor = fromBlock
  while (cursor < toBlock) {
    const end = cursor + MAX_SPAN > toBlock ? toBlock : cursor + MAX_SPAN
    const [buys, sells] = await Promise.all([
      client.getLogs({ event: BUY, args: { buyer: wallets }, fromBlock: cursor, toBlock: end }),
      client.getLogs({ event: SELL, args: { seller: wallets }, fromBlock: cursor, toBlock: end }),
    ])

    for (const log of buys) {
      if (!(await isPonsCurve(log.address))) continue
      add(log.args.buyer, -log.args.quoteIn)
    }
    for (const log of sells) {
      if (!(await isPonsCurve(log.address))) continue
      add(log.args.seller, log.args.quoteOut)
    }

    cursor = end
  }

  return { totals, scannedTo: toBlock }
}

export const toEth = (wei) => Number(formatEther(wei))
