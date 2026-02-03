import { createServer as createHttpServer } from "http"
import { createServer as createHttpsServer } from "https"
import { parse } from "url"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import next from "next"
import { initSocketServer } from "./lib/socket"

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
