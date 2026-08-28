// Dev-only: lets the page POST a data URL to /__shot so a screenshot of the
// WebGL globe can be written to disk and inspected. Not used in production.
import { writeFileSync, mkdirSync } from 'node:fs'

export default function capture() {
  return {
    name: 'capture-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const [, name, data] = body.match(/^([\w.-]+)\|(.*)$/s)
            mkdirSync('.shots', { recursive: true })
            writeFileSync(`.shots/${name}`, Buffer.from(data.split(',')[1], 'base64'))
            res.end('ok')
          } catch (e) {
            res.statusCode = 400
            res.end(String(e))
          }
        })
      })
    },
  }
}
