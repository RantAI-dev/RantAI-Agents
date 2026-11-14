import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { json, startStubRust, withRoutingEnv } from "./stub-rust"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  runChat: vi.fn(),
  respondToToolApproval: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }))
vi.mock("@/features/chat-public/service", () => ({
  runChat: mocks.runChat,
  isChatPublicServiceError: () => false,
}))
vi.mock("@/lib/tools/approval", () => ({ respondToToolApproval: mocks.respondToToolApproval }))

const { middleware } = await import("@/middleware")
const chatRoute = await import("@/app/api/chat/route")
const approvalRoute = await import("@/app/api/chat/tool-approval/route")
const healthRoute = await import("@/app/api/health/route")

type Stub = Awaited<ReturnType<typeof startStubRust>>
let stub: Stub
let restoreEnv: () => void = () => {}

beforeEach(async () => {
  stub = await startStubRust((req, res, body) => {
    if (req.url === "/readyz") return json(res, 200, { status: "ready" })
    if (req.url === "/api/chat" && body.includes("knowledgeBaseGroupIds")) {
      return json(res, 409, { error: { code: "capability_not_ported", message: "m", requestId: "r" } })
    }
    if (req.url === "/api/chat/tool-approval") {
      return json(res, 404, { error: { code: "not_found", message: "m", requestId: "r" } })
    }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.end("data: from-rust\n\n")
  })
  mocks.auth.mockResolvedValue({ user: { id: "u1", name: "U" } })
  mocks.runChat.mockResolvedValue(new Response("data: from-next\n\n"))
  mocks.respondToToolApproval.mockReturnValue("ok")
})

afterEach(async () => {
  restoreEnv()
  vi.clearAllMocks()
  await stub.close()
})

function nextRequest(pathAndQuery: string, init: { method?: string; body?: string } = {}) {
  return new NextRequest(`http://localhost:3000${pathAndQuery}`, {
    method: init.method ?? "GET",
    headers: { cookie: "authjs.session-token=t", "content-type": "application/json" },
    body: init.body,
  })
}

const isNext = (response: Response) => response.headers.get("x-middleware-next") === "1"

describe("middleware", () => {
  it("sends a routed path to Rust", async () => {
    restoreEnv = withRoutingEnv(stub.url, "assistants")
    const response = await middleware(nextRequest("/api/assistants?limit=2"))
    expect(await response.text()).toBe("data: from-rust\n\n")
    expect(stub.seen.map((s) => `${s.method} ${s.url}`)).toEqual(["GET /api/assistants?limit=2"])
    expect(stub.seen[0].headers.cookie).toBe("authjs.session-token=t")
  })

  it("keeps an unrouted path in Next", async () => {
    restoreEnv = withRoutingEnv(stub.url, "assistants")
    expect(isNext(await middleware(nextRequest("/api/dashboard/memory")))).toBe(true)
    expect(isNext(await middleware(nextRequest("/api/dashboard/chat/sessions/s1/artifacts/a1")))).toBe(true)
    expect(stub.seen).toEqual([])
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it("routes nothing when RUST_API_URL is unset", async () => {
    restoreEnv = withRoutingEnv(undefined, "assistants,sessions,memory,chat")
    expect(isNext(await middleware(nextRequest("/api/assistants")))).toBe(true)
    expect(isNext(await middleware(nextRequest("/api/dashboard/memory")))).toBe(true)
    expect(stub.seen).toEqual([])
  })

  it("sends the agent API's /v1 completions to Rust", async () => {
    restoreEnv = withRoutingEnv(stub.url, "agent-api")
    const response = await middleware(
      nextRequest("/v1/chat/completions", { method: "POST", body: "{}" }),
    )
    expect(await response.text()).toBe("data: from-rust\n\n")
    expect(stub.seen.map((s) => `${s.method} ${s.url}`)).toEqual(["POST /v1/chat/completions"])
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it("leaves /api/chat to its route handler", async () => {
    restoreEnv = withRoutingEnv(stub.url, "chat")
    const response = await middleware(nextRequest("/api/chat", { method: "POST", body: "{}" }))
    expect(isNext(response)).toBe(true)
    expect(stub.seen).toEqual([])
  })
})

describe("POST /api/chat", () => {
  const chat = (body: string) =>
    chatRoute.POST(new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }))
  const body = (extra = {}) => JSON.stringify({ messages: [{ id: "m1", role: "user", content: "hi" }], ...extra })

  it("answers from Rust when it can", async () => {
    restoreEnv = withRoutingEnv(stub.url, "chat")
    const response = await chat(body())
    expect(await response.text()).toBe("data: from-rust\n\n")
    expect(mocks.runChat).not.toHaveBeenCalled()
  })

  it("falls back to the TypeScript handler on 409 capability_not_ported", async () => {
    restoreEnv = withRoutingEnv(stub.url, "chat")
    const sent = body({ knowledgeBaseGroupIds: ["kb1"] })
    const response = await chat(sent)
    expect(await response.text()).toBe("data: from-next\n\n")
    expect(stub.seen).toHaveLength(1)
    expect(stub.seen[0].body).toBe(sent)
    expect(mocks.runChat).toHaveBeenCalledTimes(1)
    expect(mocks.runChat.mock.calls[0][0].body.messages).toEqual([{ id: "m1", role: "user", content: "hi" }])
  })

  it("stays in Next when the chat group is off", async () => {
    restoreEnv = withRoutingEnv(stub.url, "assistants")
    expect(await (await chat(body())).text()).toBe("data: from-next\n\n")
    expect(stub.seen).toEqual([])
  })
})

describe("POST /api/chat/tool-approval", () => {
  it("asks this process when Rust does not know the call", async () => {
    restoreEnv = withRoutingEnv(stub.url, "chat")
    const response = await approvalRoute.POST(new Request("http://localhost:3000/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({ toolCallId: "call_1", approved: true }),
    }))
    expect(response.status).toBe(200)
    expect(stub.seen).toHaveLength(1)
    expect(mocks.respondToToolApproval).toHaveBeenCalledWith({ toolCallId: "call_1", approved: true, userId: "u1" })
  })
})

describe("GET /api/health", () => {
  it("reports Rust's readiness when configured", async () => {
    restoreEnv = withRoutingEnv(stub.url, "memory,assistants")
    const health = await (await healthRoute.GET()).json()
    expect(health.rust).toEqual({ configured: true, routes: ["assistants", "memory"], ready: true })
  })

  it("reports not ready when Rust does not answer", async () => {
    restoreEnv = withRoutingEnv("http://127.0.0.1:1", "chat")
    expect((await (await healthRoute.GET()).json()).rust.ready).toBe(false)
  })

  it("reports nothing configured when RUST_API_URL is unset", async () => {
    restoreEnv = withRoutingEnv(undefined, undefined)
    expect((await (await healthRoute.GET()).json()).rust).toEqual({ configured: false, routes: [], ready: null })
  })
})
