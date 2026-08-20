import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { MineruExtractor } from "@/lib/rag/extractors/mineru-extractor"

/**
 * The extractor posts via node:http, not fetch — deliberately, because undici's
 * 300s headers timeout aborted dense books that MinerU was still parsing. So the
 * test drives a real local HTTP server instead of stubbing a client: it exercises
 * the multipart body, the URL handling and the error path as written.
 */

interface Captured {
  path: string
  contentType: string
  body: Buffer
}

let server: Server
let baseUrl: string
let captured: Captured | null = null
/** Set by a test to control the next response. */
let respond: (req: Captured) => { status: number; body: string } = () => ({
  status: 200,
  body: JSON.stringify({ text: "", ms: 0, pages: 0 }),
})

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      captured = {
        path: req.url ?? "",
        contentType: String(req.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks),
      }
      const { status, body } = respond(captured)
      res.writeHead(status, { "content-type": "application/json" })
      res.end(body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe("MineruExtractor", () => {
  it("posts the PDF as multipart to /extract and returns the sidecar response", async () => {
    respond = () => ({
      status: 200,
      body: JSON.stringify({ text: "# extracted markdown", ms: 1234, pages: 3 }),
    })

    const result = await new MineruExtractor(baseUrl).extract(Buffer.from("%PDF-1.5\nfake"))

    expect(result.text).toBe("# extracted markdown")
    expect(result.ms).toBe(1234)
    expect(result.pages).toBe(3)
    expect(result.model).toBe("mineru-2.5-pro")

    expect(captured?.path).toBe("/extract")
    expect(captured?.contentType).toMatch(/^multipart\/form-data; boundary=----mineru/)
    const body = captured!.body.toString("latin1")
    expect(body).toContain('name="file"; filename="document.pdf"')
    expect(body).toContain("Content-Type: application/pdf")
    expect(body).toContain("%PDF-1.5")
    // `structured` is only sent when figures were asked for.
    expect(body).not.toContain('name="structured"')
  })

  it("asks for structured output when figures are requested", async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ text: "x" }) })
    await new MineruExtractor(baseUrl).extract(Buffer.from("%PDF"), { withFigures: true })
    expect(captured!.body.toString("latin1")).toContain('name="structured"')
  })

  it("normalizes base URLs with a trailing slash", async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ text: "ok" }) })
    const result = await new MineruExtractor(`${baseUrl}/`).extract(Buffer.from("%PDF"))
    expect(result.text).toBe("ok")
    expect(captured?.path).toBe("/extract")
  })

  it("throws a descriptive error on a non-2xx response", async () => {
    respond = () => ({ status: 502, body: "upstream vlm died" })
    await expect(new MineruExtractor(baseUrl).extract(Buffer.from("%PDF"))).rejects.toThrow(
      /mineru sidecar 502: upstream vlm died/
    )
  })

  it("falls back to locally measured timing when the sidecar omits ms", async () => {
    respond = () => ({ status: 200, body: JSON.stringify({ text: "no timing" }) })
    const result = await new MineruExtractor(baseUrl).extract(Buffer.from("%PDF"))
    expect(result.text).toBe("no timing")
    expect(typeof result.ms).toBe("number")
    expect(result.ms).toBeGreaterThanOrEqual(0)
  })
})
