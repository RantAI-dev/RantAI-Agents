// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { maskAgentApiKey, hashAgentApiKey, generateAgentApiKey } from "@/lib/embed/api-key-generator"

const mockFindAgentApiKeysByOrg = vi.fn()
const mockFindAgentApiKeysByAssistant = vi.fn()
const mockFindAgentApiKeyById = vi.fn()
const mockFindAgentApiKeyByKey = vi.fn()
const mockFindAgentApiKeyByHash = vi.fn()
const mockCreateAgentApiKey = vi.fn()
const mockUpdateAgentApiKey = vi.fn()
const mockFindAssistantById = vi.fn()

vi.mock("@/features/agent-api-keys/repository", () => ({
  findAgentApiKeysByOrganization: (...args: unknown[]) => mockFindAgentApiKeysByOrg(...args),
  findAgentApiKeysByAssistantId: (...args: unknown[]) => mockFindAgentApiKeysByAssistant(...args),
  findAgentApiKeyById: (...args: unknown[]) => mockFindAgentApiKeyById(...args),
  findAgentApiKeyByKey: (...args: unknown[]) => mockFindAgentApiKeyByKey(...args),
  findAgentApiKeyByHash: (...args: unknown[]) => mockFindAgentApiKeyByHash(...args),
  createAgentApiKey: (...args: unknown[]) => mockCreateAgentApiKey(...args),
  updateAgentApiKey: (...args: unknown[]) => mockUpdateAgentApiKey(...args),
  deleteAgentApiKey: vi.fn(),
  incrementAgentApiKeyUsage: vi.fn(),
  findAssistantById: (...args: unknown[]) => mockFindAssistantById(...args),
}))

import {
  listAgentApiKeys,
  createAgentApiKey,
  authenticateAgentApiKey,
} from "@/features/agent-api-keys/service"

describe("TC-1042: Agent API Key Masking, Hash Lookup, and Lazy Backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("maskAgentApiKey helper", () => {
    it("masks key showing first 12 chars + '…' + last 4 chars", () => {
      const fullKey = "rantai_sk_0123456789abcdef0123456789abcdef" // 42 chars
      const masked = maskAgentApiKey(fullKey)
      expect(masked).toBe("rantai_sk_01…cdef")
      expect(masked.startsWith("rantai_sk_01")).toBe(true)
      expect(masked.endsWith("cdef")).toBe(true)
      expect(masked).toContain("…")
    })
  })

  describe("listAgentApiKeys endpoint masking", () => {
    it("returns masked keys in list responses, never exposing full plaintext key", async () => {
      const plaintextKey = "rantai_sk_11112222333344445555666677778888"
      mockFindAgentApiKeysByOrg.mockResolvedValue([
        {
          id: "key_1",
          name: "Production Key",
          key: plaintextKey,
          keyHash: hashAgentApiKey(plaintextKey),
          assistantId: "asst_1",
          scopes: ["chat"],
          ipWhitelist: [],
          requestCount: 5,
          lastUsedAt: new Date("2026-01-01T00:00:00Z"),
          enabled: true,
          expiresAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ])
      mockFindAssistantById.mockResolvedValue({
        id: "asst_1",
        name: "Helper",
        emoji: "🤖",
      })

      const result = await listAgentApiKeys({
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      })

      expect(Array.isArray(result)).toBe(true)
      if (Array.isArray(result)) {
        expect(result[0].key).not.toBe(plaintextKey)
        expect(result[0].key).toBe(maskAgentApiKey(plaintextKey))
      }
    })
  })

  describe("createAgentApiKey full key returned once", () => {
    it("returns full unmasked key once upon creation and populates keyHash", async () => {
      mockFindAssistantById.mockResolvedValue({
        id: "asst_1",
        name: "Helper",
        emoji: "🤖",
        organizationId: "org_1",
        isBuiltIn: false,
      })

      mockCreateAgentApiKey.mockImplementation(async (data) => ({
        ...data,
        id: "key_new",
        requestCount: 0,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const result = await createAgentApiKey({
        context: {
          organizationId: "org_1",
          role: "admin",
          userId: "user_1",
        },
        input: {
          name: "New Secret Key",
          assistantId: "asst_1",
        },
      })

      expect("error" in result).toBe(false)
      if (!("error" in result)) {
        // Positive control: full key is returned in create response
        expect(result.key.startsWith("rantai_sk_")).toBe(true)
        expect(result.key).not.toContain("…")
        expect(result.key.length).toBeGreaterThan(20)

        // Verify keyHash was stored as SHA-256
        expect(mockCreateAgentApiKey).toHaveBeenCalledWith(
          expect.objectContaining({
            keyHash: hashAgentApiKey(result.key),
          })
        )
      }
    })
  })

  describe("authenticateAgentApiKey hash lookup & lazy backfill", () => {
    it("authenticates via keyHash primary lookup without falling back to plaintext lookup", async () => {
      const fullKey = generateAgentApiKey()
      const expectedHash = hashAgentApiKey(fullKey)

      mockFindAgentApiKeyByHash.mockResolvedValue({
        id: "key_hashed",
        key: fullKey,
        keyHash: expectedHash,
        assistantId: "asst_1",
        scopes: ["chat"],
        ipWhitelist: [],
        enabled: true,
        expiresAt: null,
      })
      mockFindAssistantById.mockResolvedValue({ id: "asst_1", name: "Bot" })

      const auth = await authenticateAgentApiKey(fullKey)

      expect(auth).not.toBeNull()
      expect(mockFindAgentApiKeyByHash).toHaveBeenCalledWith(expectedHash)
      expect(mockFindAgentApiKeyByKey).not.toHaveBeenCalled()
    })

    it("falls back to plaintext key when keyHash is not yet populated and lazily backfills keyHash", async () => {
      const fullKey = generateAgentApiKey()
      const expectedHash = hashAgentApiKey(fullKey)

      // Primary lookup fails (not yet backfilled)
      mockFindAgentApiKeyByHash.mockResolvedValue(null)
      // Legacy fallback finds row with null keyHash
      mockFindAgentApiKeyByKey.mockResolvedValue({
        id: "key_legacy",
        key: fullKey,
        keyHash: null,
        assistantId: "asst_1",
        scopes: ["chat"],
        ipWhitelist: [],
        enabled: true,
        expiresAt: null,
      })
      mockUpdateAgentApiKey.mockResolvedValue({})
      mockFindAssistantById.mockResolvedValue({ id: "asst_1", name: "Bot" })

      const auth = await authenticateAgentApiKey(fullKey)

      expect(auth).not.toBeNull()
      expect(mockFindAgentApiKeyByHash).toHaveBeenCalledWith(expectedHash)
      expect(mockFindAgentApiKeyByKey).toHaveBeenCalledWith(fullKey)
      // Lazy backfill occurred
      expect(mockUpdateAgentApiKey).toHaveBeenCalledWith("key_legacy", {
        keyHash: expectedHash,
      })
    })

    it("returns null for non-existent key", async () => {
      mockFindAgentApiKeyByHash.mockResolvedValue(null)
      mockFindAgentApiKeyByKey.mockResolvedValue(null)

      const auth = await authenticateAgentApiKey("rantai_sk_invalid")
      expect(auth).toBeNull()
    })
  })
})
