// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { streamTextMock, generateTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn().mockReturnValue({
    toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response("ok")),
    text: Promise.resolve("ok"),
    consumeStream: vi.fn(),
  }),
  generateTextMock: vi.fn().mockResolvedValue({ text: "repaired" }),
}))

vi.mock("ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("ai")>()
  return {
    ...original,
    streamText: streamTextMock,
    generateText: generateTextMock,
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardSession: { findFirst: vi.fn().mockResolvedValue({ id: "session_1", userId: "user_1" }) },
    llmModel: { findFirst: vi.fn().mockResolvedValue({ id: "m-1", modelId: "rantai/nano", supportsTools: false }) },
    llmProvider: { findMany: vi.fn().mockResolvedValue([]) },
    userMemory: { findFirst: vi.fn().mockResolvedValue(null) },
    assistantSkill: { findMany: vi.fn().mockResolvedValue([]) },
    assistant: { findUnique: vi.fn().mockResolvedValue(null) },
    userSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))

vi.mock("@/lib/llm/provider", () => ({
  getChatProvider: () => () => ({}),
  resolveModelId: (id: string) => id,
}))

vi.mock("@/features/chat-public/repository", () => ({
  validateOwnedSessionId: vi.fn().mockResolvedValue("session_1"),
  findAssistantById: vi.fn().mockResolvedValue(null),
  isOrganizationMember: vi.fn().mockResolvedValue(true),
  findSessionArtifactSummaries: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  findActiveChatflowByAssistantId: vi.fn(),
  findActiveConversations: vi.fn(),
  findConversationMessages: vi.fn(),
  findConversationStatus: vi.fn(),
  findDocumentsByIds: vi.fn(),
  readChatAttachment: vi.fn(),
  saveChatAttachment: vi.fn(),
}))

vi.mock("@/lib/memory/surreal-vector", () => ({
  searchConversationMemory: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/memory/working-memory", () => ({
  loadWorkingMemory: vi.fn().mockResolvedValue(null),
  saveWorkingMemory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/memory/long-term-memory", () => ({
  loadUserProfile: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/rag/retriever", () => ({
  smartHybridRetrieve: vi.fn().mockResolvedValue({ context: "", sources: [] }),
}))

import { runChat } from "@/features/chat-public/service"

describe("runChat — AbortSignal forwarding (Stop generation audit)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes abortSignal to streamText when an AbortSignal is supplied", async () => {
    const controller = new AbortController()

    const response = await runChat({
      body: {
        messages: [{ id: "msg_1", role: "user", content: "What is the capital of Indonesia?" }],
        sessionId: "session_1",
      },
      userId: "user_1",
      headers: {
        assistantId: null,
        systemPromptB64: null,
        useKnowledgeBase: null,
      },
      abortSignal: controller.signal,
    })

    expect(response).toBeInstanceOf(Response)
    expect(streamTextMock).toHaveBeenCalledOnce()
    const callArgs = streamTextMock.mock.calls[0][0]
    expect(callArgs.abortSignal).toBe(controller.signal)
  })

  it("omits abortSignal from streamText parameters when no AbortSignal is provided", async () => {
    const response = await runChat({
      body: {
        messages: [{ id: "msg_2", role: "user", content: "Hello without abort signal" }],
        sessionId: "session_1",
      },
      userId: "user_1",
      headers: {
        assistantId: null,
        systemPromptB64: null,
        useKnowledgeBase: null,
      },
    })

    expect(response).toBeInstanceOf(Response)
    expect(streamTextMock).toHaveBeenCalledOnce()
    const callArgs = streamTextMock.mock.calls[0][0]
    expect(callArgs.abortSignal).toBeUndefined()
  })
})
