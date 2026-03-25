import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createConversationRecord,
  getChatAttachment,
  getConversationStatus,
  listConversationMessages,
  listConversations,
  uploadChatAttachment,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createConversation: vi.fn(),
  findActiveChatflowByAssistantId: vi.fn(),
  findActiveConversations: vi.fn(),
  findAssistantById: vi.fn(),
  findConversationMessages: vi.fn(),
  findConversationStatus: vi.fn(),
  findDocumentsByIds: vi.fn(),
  readChatAttachment: vi.fn(),
  saveChatAttachment: vi.fn(),
}))

vi.mock("@/lib/chat/file-processor", () => ({
  processChatFile: vi.fn(),
}))

describe("chat-public service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns invalid file type error for disallowed upload mime type", async () => {
    const file = new File(["hello"], "script.js", {
      type: "application/javascript",
    })

    const result = await uploadChatAttachment({
      file,
      userId: "user_1",
      sessionId: "session_1",
    })

    expect(result).toEqual({
      status: 400,
      error: expect.stringContaining("File type not allowed"),
      code: "INVALID_FILE_TYPE",
    })
  })

  it("returns mapped messages with ISO timestamp strings", async () => {
    const createdAt = new Date("2026-03-23T00:00:00.000Z")
    vi.mocked(repository.findConversationMessages).mockResolvedValue([
      {
        id: "msg_1",
        role: "user",
        content: "hello",
        createdAt,
      },
    ])

    const result = await listConversationMessages({ conversationId: "conv_1" })

    expect(result).toEqual({
      messages: [
        {
          id: "msg_1",
          role: "user",
          content: "hello",
          createdAt: "2026-03-23T00:00:00.000Z",
        },
      ],
    })
  })

  it("returns 404 when conversation status is missing", async () => {
    vi.mocked(repository.findConversationStatus).mockResolvedValue(null)

    const result = await getConversationStatus({ conversationId: "missing" })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("maps ENOENT to 404 when serving chat attachment", async () => {
    vi.mocked(repository.readChatAttachment).mockRejectedValue({ code: "ENOENT" })

    const result = await getChatAttachment("missing-file.txt")

    expect(result).toEqual({ status: 404, error: "File not found" })
  })

  it("returns conversation list from repository", async () => {
    vi.mocked(repository.findActiveConversations).mockResolvedValue([
      { id: "conv_1" },
      { id: "conv_2" },
    ] as never)

    const result = await listConversations()

    expect(result).toEqual([{ id: "conv_1" }, { id: "conv_2" }])
  })

  it("creates a conversation record", async () => {
    vi.mocked(repository.createConversation).mockResolvedValue({
      id: "conv_1",
      sessionId: "session_1",
      status: "AI_ACTIVE",
    } as never)

    const result = await createConversationRecord({ sessionId: "session_1" })

    expect(result).toEqual({
      id: "conv_1",
      sessionId: "session_1",
      status: "AI_ACTIVE",
    })
  })
})
