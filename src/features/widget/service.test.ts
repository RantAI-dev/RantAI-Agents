import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createWidgetHandoffMessage,
  getWidgetConfig,
  uploadWidgetFile,
  validateWidgetAccess,
} from "./service"
import * as repository from "./repository"
import * as embed from "@/lib/embed"
import * as fileProcessor from "@/lib/chat/file-processor"

vi.mock("./repository", () => ({
  countWaitingWidgetConversations: vi.fn(),
  createWidgetConversation: vi.fn(),
  createWidgetMessages: vi.fn(),
  createWidgetSystemMessage: vi.fn(),
  createWidgetUserMessage: vi.fn(),
  findConversationById: vi.fn(),
  findConversationByIdWithAgent: vi.fn(),
  findEnabledEmbedKeyByKey: vi.fn(),
  findWidgetAssistantById: vi.fn(),
  findWidgetMessages: vi.fn(),
  incrementEmbedKeyUsage: vi.fn(),
  touchEmbedKeyLastUsed: vi.fn(),
}))

vi.mock("@/lib/embed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/embed")>("@/lib/embed")
  return {
    ...actual,
    checkRateLimit: vi.fn(),
    validateApiKeyFormat: vi.fn(),
    validateDomain: vi.fn(),
  }
})

vi.mock("@/lib/chat/file-processor", () => ({
  processChatFile: vi.fn(),
}))

describe("widget service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects missing key for config flow", async () => {
    const result = await validateWidgetAccess({
      apiKey: null,
      origin: "https://example.com",
      missingCode: "MISSING_KEY",
      invalidFormatCode: "INVALID_KEY_FORMAT",
    })

    expect(result).toEqual({
      status: 400,
      error: "API key is required",
      code: "MISSING_KEY",
    })
  })

  it("returns assistant-not-found when embed key exists without assistant", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(true)
    vi.mocked(embed.validateDomain).mockReturnValue({ valid: true, domain: "example.com" })
    vi.mocked(repository.findEnabledEmbedKeyByKey).mockResolvedValue({
      id: "embed_1",
      assistantId: "assistant_1",
      allowedDomains: ["*"],
      config: {},
    } as never)
    vi.mocked(repository.findWidgetAssistantById).mockResolvedValue(null)

    const result = await getWidgetConfig({
      apiKey: "rantai_live_123",
      origin: "https://example.com",
    })

    expect(result).toEqual({
      status: 404,
      error: "Assistant not found",
      code: "ASSISTANT_NOT_FOUND",
    })
  })

  it("returns not-found when sending message to missing conversation", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(true)
    vi.mocked(embed.validateDomain).mockReturnValue({ valid: true, domain: "example.com" })
    vi.mocked(repository.findEnabledEmbedKeyByKey).mockResolvedValue({
      id: "embed_1",
      assistantId: "assistant_1",
      allowedDomains: ["*"],
      config: {},
    } as never)
    vi.mocked(repository.findConversationById).mockResolvedValue(null)

    const result = await createWidgetHandoffMessage({
      apiKey: "rantai_live_123",
      origin: "https://example.com",
      input: {
        conversationId: "conv_1",
        content: "hello",
      },
    })

    expect(result).toEqual({
      status: 404,
      error: "Conversation not found",
      code: "NOT_FOUND",
    })
  })

  it("returns rate-limit error for upload", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(true)
    vi.mocked(embed.validateDomain).mockReturnValue({ valid: true, domain: "example.com" })
    vi.mocked(repository.findEnabledEmbedKeyByKey).mockResolvedValue({
      id: "embed_1",
      assistantId: "assistant_1",
      allowedDomains: ["*"],
      config: {},
    } as never)
    vi.mocked(embed.checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetIn: 30,
    })

    const fakeFile = new File(["hello"], "hello.txt", { type: "text/plain" })
    const result = await uploadWidgetFile({
      apiKey: "rantai_live_123",
      origin: "https://example.com",
      file: fakeFile,
    })

    expect(result).toEqual({
      status: 429,
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: 30,
    })
  })

  it("processes upload successfully", async () => {
    vi.mocked(embed.validateApiKeyFormat).mockReturnValue(true)
    vi.mocked(embed.validateDomain).mockReturnValue({ valid: true, domain: "example.com" })
    vi.mocked(repository.findEnabledEmbedKeyByKey).mockResolvedValue({
      id: "embed_1",
      assistantId: "assistant_1",
      allowedDomains: ["*"],
      config: {},
    } as never)
    vi.mocked(embed.checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 10,
      resetIn: 60,
    })
    vi.mocked(fileProcessor.processChatFile).mockResolvedValue({
      success: true,
      text: "hello",
    } as never)

    const fakeFile = new File(["hello"], "hello.txt", { type: "text/plain" })
    const result = await uploadWidgetFile({
      apiKey: "rantai_live_123",
      origin: "https://example.com",
      file: fakeFile,
    })

    expect(result).toMatchObject({
      success: true,
      fileName: "hello.txt",
      fileType: "text/plain",
    })
  })
})
