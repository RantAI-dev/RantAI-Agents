// Suppress known noisy warnings (baseline-browser-mapping staleness + Next.js
// middleware->proxy deprecation). Both are non-actionable for us right now.
const SUPPRESSED_WARNINGS = [
  "baseline-browser-mapping",
  'The "middleware" file convention is deprecated',
]
const origStderrWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = ((chunk: any, ...rest: any[]) => {
  const str = typeof chunk === "string" ? chunk : chunk?.toString?.() ?? ""
  if (SUPPRESSED_WARNINGS.some((s) => str.includes(s))) return true
  return origStderrWrite(chunk, ...rest)
}) as typeof process.stderr.write
const origWarn = console.warn
console.warn = (...args: any[]) => {
  const str = args.map((a) => (typeof a === "string" ? a : "")).join(" ")
  if (SUPPRESSED_WARNINGS.some((s) => str.includes(s))) return
  origWarn(...args)
}

import { createServer as createHttpServer } from "http"
import { createServer as createHttpsServer } from "https"
import { parse } from "url"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import next from "next"
import { initSocketServer } from "./src/lib/socket"

const dev = process.env.NODE_ENV !== "production"
const hostname = "localhost"
const port = parseInt(process.env.PORT || "3000", 10)

// Check if we should use HTTPS (look for local certificates)
const certsPath = join(process.cwd(), "certs")
const keyPath = join(certsPath, "localhost-key.pem")
const certPath = join(certsPath, "localhost.pem")
const useHttps = existsSync(keyPath) && existsSync(certPath)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  let server

  if (useHttps) {
    const httpsOptions = {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
    }
    server = createHttpsServer(httpsOptions, (req, res) => {
      const parsedUrl = parse(req.url!, true)
      handle(req, res, parsedUrl)
    })
    console.log(`> HTTPS enabled with local certificates`)
  } else {
    server = createHttpServer((req, res) => {
      const parsedUrl = parse(req.url!, true)
      handle(req, res, parsedUrl)
    })
  }

  // Initialize Socket.io
  initSocketServer(server)

  const protocol = useHttps ? "https" : "http"
  server.listen(port, () => {
    console.log(`> Ready on ${protocol}://${hostname}:${port}`)
    console.log(`> Socket.io server running on /api/socket`)
    if (!useHttps) {
      console.log(`> To enable HTTPS, run: pnpm dev:https:setup`)
    }
  })
})
