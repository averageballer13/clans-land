/* Local and single-host deployments: one long-lived process that serves the
   API, holds event streams open, and scans the chain on a timer. */
import app, { broadcast, scoreLiveWars } from './app.js'
import { migrate } from './db.js'
import { settleDueWars } from './world.js'

const PORT = Number(process.env.PORT || 8787)

await migrate()

setInterval(async () => {
  try {
    const scored = await scoreLiveWars()
    const settled = await settleDueWars()
    if (scored || settled > 0) await broadcast()
  } catch (e) {
    console.error('[clans] tick failed:', e.message)
  }
}, 15000).unref?.()

app.listen(PORT, () => console.log(`[clans] listening on http://localhost:${PORT}`))
