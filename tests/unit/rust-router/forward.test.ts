import { afterEach, describe, expect, it } from "vitest"
import { forwardToRust, forwardWithFallback, UPSTREAM_HEADER } from "@/lib/rust-router/forward"
import { json, startStubRust } from "./stub-rust"

type Stub = Awaited<ReturnType<typeof startStubRust>>
let stub: Stub | null = null
afterEach(async () => {
  await stub?.close()
  stub = null
})

function browserRequest(method: string, body?: string) {
  return new Request("https://app.example.com/api/assistants/a1?x=1", {
    method,
    headers: {
      cookie: "authjs.session-token=abc; other=1",
      authorization: "Bearer mobile.jwt",
      "x-organization-id": "org_1",
      "content-type": "application/json",
      "x-middleware-subrequest": "internal",
    },
    body,
  })
}

describe("forwardToRust", () => {
  it("forwards the method, body, cookies, Authorization and x-organization-id", async () => {
    stub = await startStubRust((_req, res) => json(res, 200, { ok: true }))
    const response = await forwardToRust(
      browserRequest("PATCH", '{"name":"n"}'),
      `${stub.url}/api/assistants/a1?x=1`,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get(UPSTREAM_HEADER)).toBe("rust")
    const [seen] = stub.seen
    expect(seen.method).toBe("PATCH")
    expect(seen.url).toBe("/api/assistants/a1?x=1")
    expect(seen.body).toBe('{"name":"n"}')
    expect(seen.headers.cookie).toBe("authjs.session-token=abc; other=1")
    expect(seen.headers.authorization).toBe("Bearer mobile.jwt")
    expect(seen.headers["x-organization-id"]).toBe("org_1")
    expect(seen.headers["x-forwarded-host"]).toBe("app.example.com")
    expect(seen.headers["x-forwarded-proto"]).toBe("https")
    expect(seen.headers["x-middleware-subrequest"]).toBeUndefined()
  })

  it("passes the status and every Set-Cookie back", async () => {
    stub = await startStubRust((_req, res) => {
      res.writeHead(403, { "set-cookie": ["a=1; Path=/", "b=2; Path=/"], "x-request-id": "r1" })
      res.end('{"error":{"code":"forbidden"}}')
    })
    const response = await forwardToRust(browserRequest("GET"), `${stub.url}/api/assistants`)
    expect(response.status).toBe(403)
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"])
    expect(response.headers.get("x-request-id")).toBe("r1")
    expect(stub.seen[0].body).toBe("")
  })

  it("streams: the first chunk arrives before the upstream finishes", async () => {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => (finish = resolve))
    stub = await startStubRust((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.write("data: first\n\n")
      void finished.then(() => res.end("data: [DONE]\n\n"))
    })
    const response = await forwardToRust(browserRequest("POST", "{}"), `${stub.url}/api/chat`)
    const reader = response.body!.getReader()
    const first = await reader.read()
    // The upstream is still open here: a buffering proxy would not have returned yet.
    expect(new TextDecoder().decode(first.value)).toBe("data: first\n\n")
    finish()
    let rest = ""
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      rest += new TextDecoder().decode(r.value)
    }
    expect(rest).toBe("data: [DONE]\n\n")
  })

  it("answers 502 upstream_failed when Rust cannot be reached", async () => {
    const response = await forwardToRust(browserRequest("GET"), "http://127.0.0.1:1/api/assistants")
    expect(response.status).toBe(502)
    expect((await response.json()).error.code).toBe("upstream_failed")
  })
})

describe("forwardWithFallback", () => {
  const notPorted = { status: 409, code: "capability_not_ported" }

  it("runs the fallback with the same request on the matching 409", async () => {
    stub = await startStubRust((_req, res) =>
      json(res, 409, { error: { code: "capability_not_ported", message: "m", requestId: "r" } }),
    )
    let replayed: { method: string; body: string; cookie: string | null } | null = null
    const response = await forwardWithFallback(browserRequest("POST", '{"q":1}'), `${stub.url}/api/chat`, {
      fallbackOn: notPorted,
      fallback: async (req) => {
        replayed = { method: req.method, body: await req.text(), cookie: req.headers.get("cookie") }
        return new Response("from next", { status: 200 })
      },
    })
    expect(await response.text()).toBe("from next")
    expect(stub.seen[0].body).toBe('{"q":1}')
    expect(replayed).toEqual({
      method: "POST",
      body: '{"q":1}',
      cookie: "authjs.session-token=abc; other=1",
    })
  })

  it("passes any other 409 through unchanged", async () => {
    stub = await startStubRust((_req, res) =>
      json(res, 409, { error: { code: "conflict", message: "m", requestId: "r" } }),
    )
    let called = false
    const response = await forwardWithFallback(browserRequest("POST", "{}"), `${stub.url}/api/chat`, {
      fallbackOn: notPorted,
      fallback: () => ((called = true), new Response("next")),
    })
    expect(called).toBe(false)
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe("conflict")
  })

  it("passes other statuses through without calling the fallback", async () => {
    stub = await startStubRust((_req, res) => json(res, 401, { error: { code: "unauthorized" } }))
    let called = false
    const response = await forwardWithFallback(browserRequest("POST", "{}"), `${stub.url}/api/chat`, {
      fallbackOn: notPorted,
      fallback: () => ((called = true), new Response("next")),
    })
    expect(called).toBe(false)
    expect(response.status).toBe(401)
  })
})
