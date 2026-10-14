// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindAgentApiKeyByHash = vi.fn()
const mockFindAgentApiKeyByKey = vi.fn()
const mockFindAssistantById = vi.fn()
const mockUpdateAgentApiKey = vi.fn()

vi.mock("@/features/agent-api-keys/repository", () => ({
  findAgentApiKeysByOrganization: vi.fn(),
  findAgentApiKeysByAssistantId: vi.fn(),
  findAgentApiKeyById: vi.fn(),
  findAgentApiKeyByKey: (...args: unknown[]) => mockFindAgentApiKeyByKey(...args),
  findAgentApiKeyByHash: (...args: unknown[]) => mockFindAgentApiKeyByHash(...args),
  createAgentApiKey: vi.fn(),
  updateAgentApiKey: (...args: unknown[]) => mockUpdateAgentApiKey(...args),
  deleteAgentApiKey: vi.fn(),
  incrementAgentApiKeyUsage: vi.fn(),
  findAssistantById: (...args: unknown[]) => mockFindAssistantById(...args),
}))

import { authenticateAgentApiKey } from "@/features/agent-api-keys/service"
import { authenticateV1Request } from "@/features/agent-api/service"
import { POST } from "@/app/api/v1/chat/completions/route"

describe("TC-1559: IP Whitelist Enforcement & Error Status", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockKeyWithIp = {
    id: "key_ip",
    key: "rantai_sk_testkeywithip12345678901234",
    keyHash: "dummyhash",
    assistantId: "asst_1",
    scopes: ["chat"],
    ipWhitelist: ["10.99.99.99"],
    enabled: true,
    expiresAt: null,
  }

  const mockAssistant = {
    id: "asst_1",
    name: "Test Assistant",
    emoji: "🤖",
    organizationId: "org_1",
    isBuiltIn: false,
    systemPrompt: "You are a helpful assistant with enough characters in prompt.",
    model: "test-model",
  }

  describe("authenticateAgentApiKey", () => {
    it("allows request when requestIp matches ipWhitelist (positive control)", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const result = await authenticateAgentApiKey(mockKeyWithIp.key, "10.99.99.99")

      expect(result).not.toBeNull()
      expect(result).toHaveProperty("apiKey")
      expect(result).not.toHaveProperty("error")
    })

    it("returns ip_not_allowed error when requestIp does not match ipWhitelist", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const result = await authenticateAgentApiKey(mockKeyWithIp.key, "127.0.0.1")

      expect(result).toEqual({ error: "ip_not_allowed" })
    })

    it("returns ip_not_allowed error when ipWhitelist is non-empty and requestIp is missing", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const result = await authenticateAgentApiKey(mockKeyWithIp.key, undefined)

      expect(result).toEqual({ error: "ip_not_allowed" })
    })

    it("allows any requestIp when ipWhitelist is empty (positive control)", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue({
        ...mockKeyWithIp,
        ipWhitelist: [],
      })
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const result = await authenticateAgentApiKey(mockKeyWithIp.key, "127.0.0.1")

      expect(result).not.toBeNull()
      expect(result).toHaveProperty("apiKey")
    })

    it("returns null for revoked/disabled key regardless of IP", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue({
        ...mockKeyWithIp,
        enabled: false,
      })
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const result = await authenticateAgentApiKey(mockKeyWithIp.key, "10.99.99.99")

      expect(result).toBeNull()
    })
  })

  describe("authenticateV1Request", () => {
    it("returns 403 with 'IP address not allowed' for valid key from disallowed IP", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const headers = new Headers({
        "x-forwarded-for": "127.0.0.1",
      })

      const result = await authenticateV1Request(
        `Bearer ${mockKeyWithIp.key}`,
        headers
      )

      expect("status" in result).toBe(true)
      if ("status" in result) {
        expect(result.status).toBe(403)
        expect(result.error).toBe("IP address not allowed")
      }
    })

    it("returns 401 with 'Invalid or expired API key' for invalid key", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(null)
      mockFindAgentApiKeyByKey.mockResolvedValue(null)

      const headers = new Headers({
        "x-forwarded-for": "127.0.0.1",
      })

      const result = await authenticateV1Request(
        "Bearer rantai_sk_nonexistent",
        headers
      )

      expect("status" in result).toBe(true)
      if ("status" in result) {
        expect(result.status).toBe(401)
        expect(result.error).toBe("Invalid or expired API key")
      }
    })

    it("returns auth result for valid key with allowed IP (positive control)", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const headers = new Headers({
        "x-forwarded-for": "10.99.99.99",
      })

      const result = await authenticateV1Request(
        `Bearer ${mockKeyWithIp.key}`,
        headers
      )

      expect("apiKey" in result).toBe(true)
    })
  })

  describe("POST /api/v1/chat/completions route HTTP response", () => {
    it("returns HTTP 403 with {\"error\":\"IP address not allowed\"} on IP mismatch", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(mockKeyWithIp)
      mockFindAssistantById.mockResolvedValue(mockAssistant)

      const req = new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${mockKeyWithIp.key}`,
          "x-forwarded-for": "127.0.0.1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data).toEqual({ error: "IP address not allowed" })
    })

    it("returns HTTP 401 for invalid/expired API key", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(null)
      mockFindAgentApiKeyByKey.mockResolvedValue(null)

      const req = new Request("http://localhost/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: "Bearer rantai_sk_invalid",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error.message).toBe("Invalid or expired API key")
    })
  })
})
