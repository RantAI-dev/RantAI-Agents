import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardHandoffRequest,
  getDashboardHandoffStatus,
  sendDashboardHandoffMessage,
} from "./service"
import * as repository from "./repository"
import { broadcastQueueUpdate, getIOInstance } from "@/lib/socket"

const socketInstance = {
  to: vi.fn(),
}

vi.mock("@/lib/socket", () => ({
  getIOInstance: vi.fn(),
  broadcastQueueUpdate: vi.fn(),
}))

vi.mock("./repository", () => ({
  countWaitingConversations: vi.fn(),
  createConversation: vi.fn(),
  createMessagesMany: vi.fn(),
  createMessage: vi.fn(),
  findConversationById: vi.fn(),
  findMessagesAfterConversation: vi.fn(),
}))

describe("dashboard handoff service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(repository.countWaitingConversations).mockResolvedValue(3 as never)
    vi.mocked(repository.createConversation).mockResolvedValue({
      id: "conversation_1",
      sessionId: "dashboard_user_1_123",
      customerName: "Dashboard User",
      customerEmail: null,
      customerPhone: null,
      productInterest: null,
      channel: "PORTAL",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      handoffAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never)
    vi.mocked(repository.createMessagesMany).mockResolvedValue({} as never)
    vi.mocked(repository.createMessage).mockResolvedValue({
      id: "message_1",
      role: "SYSTEM",
      content: "Customer requested to speak with an agent from the dashboard chat.",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never)
    vi.mocked(repository.findConversationById).mockResolvedValue({
      id: "conversation_1",
      status: "WAITING_FOR_AGENT",
      agent: { name: "Agent Smith" },
    } as never)
    vi.mocked(repository.findMessagesAfterConversation).mockResolvedValue([
      {
        id: "message_1",
        role: "SYSTEM",
        content: "Hi",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ] as never)
    socketInstance.to.mockReturnValue({
      emit: vi.fn(),
    })
    vi.mocked(getIOInstance).mockReturnValue(socketInstance as never)
  })

  it("creates a handoff request and broadcasts it to agents", async () => {
    const result = await createDashboardHandoffRequest({
      actor: {
        userId: "user_1",
        userName: "Ada",
        userEmail: "ada@example.com",
      },
      input: {
        assistantId: "assistant_1",
        chatHistory: [{ role: "user", content: "Help" }],
      },
    })

    expect(result).toEqual({
      conversationId: "conversation_1",
      status: "WAITING_FOR_AGENT",
      queuePosition: 3,
    })
    expect(repository.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        productInterest: "assistant_1",
        customerName: "Ada",
        customerEmail: "ada@example.com",
      })
    )
    expect(repository.createMessagesMany).toHaveBeenCalledWith([
      {
        conversationId: "conversation_1",
        role: "USER",
        content: "Help",
      },
    ])
    expect(broadcastQueueUpdate).toHaveBeenCalledWith(socketInstance)
  })

  it("returns 404 when polling a missing conversation", async () => {
    vi.mocked(repository.findConversationById).mockResolvedValue(null)

    const result = await getDashboardHandoffStatus({
      conversationId: "missing",
    })

    expect(result).toEqual({ status: 404, error: "Conversation not found" })
  })

  it("returns 400 when sending a message without required fields", async () => {
    const result = await sendDashboardHandoffMessage({
      input: { conversationId: "", content: "" },
    })

    expect(result).toEqual({
      status: 400,
      error: "conversationId and content are required",
    })
  })

  it("sends a dashboard handoff message to the conversation room", async () => {
    vi.mocked(repository.findConversationById).mockResolvedValue({
      id: "conversation_1",
      sessionId: "session_1",
    } as never)

    const result = await sendDashboardHandoffMessage({
      input: { conversationId: "conversation_1", content: "Hello" },
    })

    expect(result).toEqual({ messageId: "message_1" })
    expect(socketInstance.to).toHaveBeenCalledWith("conversation:session_1")
  })
})
