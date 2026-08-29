/* Vercel entry point.

   Vercel's own catch-all only reached one path segment here — /api/world
   arrived, /api/auth/nonce did not — so the rewrite in vercel.json hands the
   matched segments over explicitly as `__p` and this rebuilds the real URL
   before the Express app ever sees it. Nothing is left to inference.
*/
import app from '../server/app.js'

export default function handler(req, res) {
  const url = new URL(req.url, 'http://internal')
  const path = url.searchParams.get('__p')
  if (path !== null) {
    url.searchParams.delete('__p')
    const rest = url.searchParams.toString()
    req.url = `/api/${path}${rest ? `?${rest}` : ''}`
  }
  return app(req, res)
}
