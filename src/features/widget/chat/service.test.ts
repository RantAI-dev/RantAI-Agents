import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { handleWidgetChat } from "./service"
import * as embed from "@/lib/embed"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findActiveChatflowWorkflow: vi.fn(),
  findEnabledWidgetEmbedKey: vi.fn(),
  findWidgetAssistantById: vi.fn(),
  incrementWidgetEmbedKeyUsage: vi.fn(),
  setWidgetUserMemoryExpiry: vi.fn(),
}))

vi.mock("@/lib/embed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/embed")>("@/lib/embed")
  return {
    ...actual,
    checkRateLimit: vi.fn(),
    extractOrigin: vi.fn(() => "https://example.com"),
    validateApiKeyFormat: vi.fn(),
    validateDomain: vi.fn(),
  }
})

describe("widget-chat service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when key is missing", async () => {
    const req = new NextRequest("https://example.com/api/widget/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: { "content-type": "application/json" },
    })

    const res = await handleWidgetChat(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json).toEqual({ error: "API key is required", code: "MISSING_KEY" })
  })

  it("returns 400 when key format is invalid", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(false)

    const req = new NextRequest("https://example.com/api/widget/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
      headers: {
        "content-type": "application/json",
        "x-widget-api-key": "invalid",
      },
    })

    const res = await handleWidgetChat(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json).toEqual({ error: "Invalid API key format", code: "INVALID_KEY_FORMAT" })
  })

  it("returns 400 when messages are missing", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(true)
    vi.mocked(repository.findEnabledWidgetEmbedKey).mockResolvedValue({
      id: "embed_1",
      assistantId: "assistant_1",
      allowedDomains: ["*"],
    } as never)
    vi.mocked(embed.validateDomain).mockReturnValue({ valid: true, domain: "example.com" })
    vi.mocked(embed.checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetIn: 60,
    })

    const req = new NextRequest("https://example.com/api/widget/chat", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: {
        "content-type": "application/json",
        "x-widget-api-key": "rantai_live_123",
      },
    })

    const res = await handleWidgetChat(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json).toEqual({ error: "Messages are required", code: "MISSING_MESSAGES" })
  })
})
