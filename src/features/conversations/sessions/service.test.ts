import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addDashboardChatSessionMessages,
  createDashboardChatSession,
  deleteDashboardChatSessionArtifact,
  deleteDashboardChatSessionMessages,
  deleteDashboardChatSession,
  getDashboardChatSession,
  listDashboardChatSessions,
  updateDashboardChatSession,
  updateDashboardChatSessionArtifact,
  updateDashboardChatSessionMessage,
} from "./service"
import * as repository from "./repository"
import { deleteFile, uploadFile } from "@/lib/s3"

vi.mock("./repository", () => ({
  createDashboardMessages: vi.fn(),
  createDashboardSession: vi.fn(),
  deleteDashboardArtifactById: vi.fn(),
  deleteDashboardMessagesBySession: vi.fn(),
  deleteDashboardSessionById: vi.fn(),
  findArtifactsBySessionId: vi.fn().mockResolvedValue([]),
  findDashboardArtifactByIdAndSession: vi.fn(),
  findDashboardMessageByIdAndSession: vi.fn(),
  findDashboardSessionBasicByIdAndUser: vi.fn(),
  findDashboardSessionByIdAndUser: vi.fn(),
  findDashboardSessionsByUser: vi.fn(),
  updateDashboardArtifactByIdLocked: vi.fn(),
  updateDashboardMessageById: vi.fn(),
  updateDashboardSessionTitle: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
  uploadFile: vi.fn(),
}))

vi.mock("@/lib/rag/vector-store", () => ({
  deleteChunksByDocumentId: vi.fn(),
}))

vi.mock("@/lib/rag", () => ({
  deleteChunksByDocumentId: vi.fn(),
  // Return a resolved promise so the fire-and-forget `.catch(...)` chain
  // in service.ts doesn't throw on undefined.
  indexArtifactContent: vi.fn().mockResolvedValue(undefined),
}))

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    assistant: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    document: { deleteMany: vi.fn() },
    dashboardSession: { delete: vi.fn() },
    dashboardMessage: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}))

describe("dashboard chat sessions service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: assistant exists and is system-global, so the org-membership
    // check short-circuits. Tests that exercise the org-scope path can
    // override.
    prismaMock.assistant.findUnique.mockResolvedValue({
      id: "assistant_1",
      organizationId: null,
    } as never)
    prismaMock.organizationMember.findFirst.mockResolvedValue(null as never)
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops)
  })

  it("lists chat sessions with summary fields", async () => {
    vi.mocked(repository.findDashboardSessionsByUser).mockResolvedValue([
      {
        id: "session_1",
        title: "Chat 1",
        assistantId: "assistant_1",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        messages: [{ content: "hello", createdAt: new Date() }],
        _count: { messages: 1 },
      },
    ] as never)

    const result = await listDashboardChatSessions({ userId: "user_1" })

    expect(result).toEqual([
      expect.objectContaining({
        id: "session_1",
        messageCount: 1,
        lastMessage: "hello",
      }),
    ])
  })

  it("creates a session when assistantId is present", async () => {
    vi.mocked(repository.createDashboardSession).mockResolvedValue({
      id: "session_1",
      title: "New Chat",
      assistantId: "assistant_1",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as never)

    const result = await createDashboardChatSession({
      userId: "user_1",
      input: { assistantId: "assistant_1", title: "" },
    })

    expect(result).toEqual(
      expect.objectContaining({
        id: "session_1",
        title: "New Chat",
      })
    )
  })

  it("returns 404 when loading a missing session", async () => {
    vi.mocked(repository.findDashboardSessionByIdAndUser).mockResolvedValue(null)

    const result = await getDashboardChatSession({
      userId: "user_1",
      sessionId: "missing",
    })

    expect(result).toEqual({ status: 404, error: "Session not found" })
  })

  it("adds messages to a session", async () => {
    vi.mocked(repository.findDashboardSessionBasicByIdAndUser).mockResolvedValue({
      id: "session_1",
    } as never)
    vi.mocked(repository.createDashboardMessages).mockResolvedValue([
      {
        id: "message_1",
        role: "user",
        content: "hello",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        replyTo: null,
        editHistory: null,
        sources: null,
        metadata: null,
      },
    ] as never)

    const result = await addDashboardChatSessionMessages({
      userId: "user_1",
      sessionId: "session_1",
      input: { messages: [{ role: "user", content: "hello" }] },
    })

    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          id: "message_1",
          content: "hello",
        }),
      ],
    })
  })

  it("updates an artifact and uploads the new content", async () => {
    vi.mocked(repository.findDashboardSessionBasicByIdAndUser).mockResolvedValue({
      id: "session_1",
    } as never)
    vi.mocked(repository.findDashboardArtifactByIdAndSession).mockResolvedValue({
      id: "artifact_1",
      title: "Spec",
      content: "old content",
      s3Key: "docs/spec.txt",
      mimeType: "text/plain",
      artifactType: "note",
      metadata: { versions: [] },
    } as never)
    vi.mocked(repository.updateDashboardArtifactByIdLocked).mockResolvedValue({
      id: "artifact_1",
      title: "Updated Spec",
      content: "new content",
      artifactType: "note",
      metadata: { versions: [{ content: "old content" }] },
    } as never)

    const result = await updateDashboardChatSessionArtifact({
      userId: "user_1",
      sessionId: "session_1",
      artifactId: "artifact_1",
      input: { content: "new content", title: "Updated Spec" },
    })

    expect(result).toEqual(expect.objectContaining({ title: "Updated Spec" }))
    expect(uploadFile).toHaveBeenCalledWith(
      "docs/spec.txt",
      expect.any(Buffer),
      "text/plain"
    )
  })

  it("deletes a session when authorized", async () => {
    vi.mocked(repository.findDashboardSessionBasicByIdAndUser).mockResolvedValue({
      id: "session_1",
    } as never)

    const result = await deleteDashboardChatSession({
      userId: "user_1",
      sessionId: "session_1",
    })

    expect(result).toEqual({ success: true })
  })

  it("returns 400 when deleting messages without ids", async () => {
    const result = await deleteDashboardChatSessionMessages({
      userId: "user_1",
      sessionId: "session_1",
      input: { messages: [] } as never,
    })

    expect(result).toEqual({ status: 400, error: "messageIds array is required" })
  })
})
