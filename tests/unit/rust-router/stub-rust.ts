import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

export interface Seen {
  method: string
  url: string
  headers: IncomingMessage["headers"]
  body: string
}

export type StubHandler = (req: IncomingMessage, res: ServerResponse, body: string) => void

/** A stand-in for agents-server on a free port; records every request it sees. */
export async function startStubRust(handler: StubHandler) {
  const seen: Seen[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8")
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body })
      handler(req, res, body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

/** Sets the routing variables for one test and returns the function that restores them. */
export function withRoutingEnv(url: string | undefined, routes: string | undefined) {
  const before = { url: process.env.RUST_API_URL, routes: process.env.RUST_ROUTES }
  const set = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  set("RUST_API_URL", url)
  set("RUST_ROUTES", routes)
  return () => {
    set("RUST_API_URL", before.url)
    set("RUST_ROUTES", before.routes)
  }
}
