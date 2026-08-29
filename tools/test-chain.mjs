/* Checks the Robinhood Chain / Pons integration against the live chain.
   Nothing here signs or spends: it only reads.  Run: npm run test:chain */
import { client, head, verifyLaunch, scanTrades, isPonsCurve, toEth } from '../server/chain.js'
import { PONS, factoryAbi, LAUNCH_CONFIG_ID, PAIR_TOKEN } from '../src/lib/pons.js'
import { formatEther } from 'viem'

let failures = 0
const check = (label, cond, extra = '') => {
  if (!cond) failures++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

console.log('\n--- clans.land chain check ---\n')

const chainId = await client.getChainId()
check('connected to Robinhood Chain', chainId === 4663, `chain ${chainId}`)

const to = await head()
check('the chain has a head block', to > 0n, String(to))

const read = (functionName, args) =>
  client.readContract({ address: PONS.factory, abi: factoryAbi, functionName, args })

const enabled = await read('launchEnabled')
check('the Pons factory accepts launches', enabled === true)

const fee = await read('launchFee')
check('the launch fee is readable', fee > 0n, `${formatEther(fee)} ETH`)

const pin = await read('previewLaunchEconomics', [LAUNCH_CONFIG_ID, PAIR_TOKEN])
check('the economics pin is not zero', /[1-9a-f]/.test(pin.slice(2)), pin.slice(0, 18) + '…')

const config = await read('getLaunchConfig', [LAUNCH_CONFIG_ID])
check('launch config 0 is enabled', config.enabled === true,
  `graduates at ${formatEther(config.graduationThreshold)} ETH`)

/* Find a launch that really happened, and prove the verifier accepts it and
   rejects anyone else claiming it. */
const launchEvent = factoryAbi.find((e) => e.type === 'event' && e.name === 'TokenLaunched')
let sample = null
for (let span = 0; span < 25 && !sample; span++) {
  const end = to - BigInt(span * 4000)
  const logs = await client.getLogs({ address: PONS.factory, event: launchEvent, fromBlock: end - 4000n, toBlock: end })
  if (logs.length) sample = logs[logs.length - 1]
}
check('found a real launch in recent blocks', !!sample, sample ? `token ${sample.args.token}` : 'none in ~100k blocks')

if (sample) {
  const verified = await verifyLaunch(sample.transactionHash, sample.args.deployer)
  check('the verifier reads that launch back from its receipt',
    verified.token.toLowerCase() === sample.args.token.toLowerCase(),
    `$${verified.symbol || '?'}`)

  const impostor = '0x000000000000000000000000000000000000dEaD'
  let refused = false
  try { await verifyLaunch(sample.transactionHash, impostor) } catch { refused = true }
  check('another wallet cannot claim that launch', refused)

  check('the curve from that launch is recognised as genuine', await isPonsCurve(sample.args.curve))
  check('a random address is not', !(await isPonsCurve('0x000000000000000000000000000000000000bEEF')))
}

/* Scoring: scan a recent window for real trades and make sure the reader
   returns signed ETH amounts. */
const buyEvent = {
  type: 'event', name: 'CurveBuy',
  inputs: [
    { name: 'buyer', type: 'address', indexed: true },
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'quoteIn', type: 'uint256' }, { name: 'tokensOut', type: 'uint256' },
    { name: 'fee', type: 'uint256' }, { name: 'tax', type: 'uint256' },
  ],
}
let traders = []
for (let span = 0; span < 12 && !traders.length; span++) {
  const end = to - BigInt(span * 2000)
  const logs = await client.getLogs({ event: buyEvent, fromBlock: end - 2000n, toBlock: end })
  traders = [...new Set(logs.map((l) => l.args.buyer))].slice(0, 3)
}
check('found wallets trading on Pons right now', traders.length > 0, `${traders.length} wallets`)

if (traders.length) {
  const { totals, scannedTo } = await scanTrades(traders, to - 3000n, to)
  const lines = [...totals.entries()].map(([a, wei]) => `${a.slice(0, 8)}… ${toEth(wei).toFixed(6)} ETH`)
  check('the scanner returns a net ETH figure per wallet', totals.size > 0, lines.join(' | ') || 'no trades in window')
  check('the scanner reports how far it got', scannedTo === to)
}

console.log(`\n${failures === 0 ? 'all checks passed' : failures + ' check(s) failed'}\n`)
process.exit(failures === 0 ? 0 : 1)
