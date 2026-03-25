import { beforeEach, describe, expect, it, vi } from "vitest"
import * as repository from "./repository"
import { handleMcpOptionsRequest, handleMcpRequest } from "./service"

vi.mock("./repository", () => ({
  findEnabledMcpApiKeyByValue: vi.fn(),
  incrementMcpApiKeyUsage: vi.fn(),
}))

vi.mock("@/lib/mcp/api-key", () => ({
  validateMcpApiKeyFormat: vi.fn(() => true),
}))

describe("mcp service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repository.incrementMcpApiKeyUsage).mockResolvedValue({} as never)
  })

  it("returns unauthorized response when API key is missing", async () => {
    const response = await handleMcpRequest(new Request("https://example.test/mcp"))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    })
  })

  it("handles authenticated MCP request", async () => {
    vi.mocked(repository.findEnabledMcpApiKeyByValue).mockResolvedValue({
      id: "key_1",
      key: "rantai_mcp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "Key",
      organizationId: "org_1",
      exposedTools: ["toolA"],
      enabled: true,
      requestCount: 0,
      lastUsedAt: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const connect = vi.fn(async () => undefined)
    const handleRequest = vi.fn(async () => new Response("ok", { status: 200 }))

    const response = await handleMcpRequest(
      new Request("https://example.test/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer rantai_mcp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
      {
        createServer: () => ({ connect } as never),
        createTransport: () => ({ handleRequest } as never),
      }
    )

    expect(connect).toHaveBeenCalledOnce()
    expect(handleRequest).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    expect(repository.incrementMcpApiKeyUsage).toHaveBeenCalledWith("key_1")
  })

  it("returns CORS response for OPTIONS", () => {
    const response = handleMcpOptionsRequest()
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, DELETE, OPTIONS"
    )
  })
})
