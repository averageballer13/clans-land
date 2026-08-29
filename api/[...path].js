/* Vercel entry point.

   A catch-all so every /api/* request reaches the same Express app the
   long-lived server runs, with its original path intact.
*/
import app from '../server/app.js'

export default app
