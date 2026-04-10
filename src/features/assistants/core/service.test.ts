import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createAssistantForUser,
  deleteAssistantForUser,
  listAssistantsForUser,
  updateAssistantForUser,
} from "./service"
import * as repository from "./repository"
import * as models from "@/lib/models"

vi.mock("./repository", () => ({
  createAssistant: vi.fn(),
  deleteAssistantById: vi.fn(),
  findAssistantById: vi.fn(),
  listAssistantsByScope: vi.fn(),
  updateAssistantById: vi.fn(),
}))

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "model-default",
  isValidModel: vi.fn(),
}))

describe("assistants service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(models.isValidModel).mockReturnValue(true)
  })

  it("restricts built-in updates to allowed fields", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      name: "Built-in",
      description: null,
      emoji: "🤖",
      systemPrompt: "base",
      model: "model-1",
      useKnowledgeBase: true,
      knowledgeBaseGroupIds: [],
      isSystemDefault: false,
      isBuiltIn: true,
      organizationId: null,
      createdBy: null,
      updatedBy: null,
      liveChatEnabled: false,
      avatarS3Key: null,
      modelConfig: null,
      openingMessage: null,
      openingQuestions: [],
      guardRails: null,
      chatConfig: null,
      memoryConfig: null,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(repository.updateAssistantById).mockResolvedValue({
      id: "assistant_1",
      updatedBy: "user_1",
    } as never)

    await updateAssistantForUser({
      id: "assistant_1",
      userId: "user_1",
      input: {
        name: "should-not-apply",
        useKnowledgeBase: false,
        knowledgeBaseGroupIds: ["group_1"],
        description: "allowed",
      },
      context: { organizationId: null, role: null },
    })

    expect(repository.updateAssistantById).toHaveBeenCalledOnce()
    expect(repository.updateAssistantById).toHaveBeenCalledWith(
      "assistant_1",
      expect.objectContaining({
        updatedBy: "user_1",
        description: "allowed",
      })
    )
    expect(repository.updateAssistantById).not.toHaveBeenCalledWith(
      "assistant_1",
      expect.objectContaining({
        name: "should-not-apply",
      })
    )
  })

  it("returns 403 when non-manager deletes org assistant", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_org",
      name: "Org Assistant",
      description: null,
      emoji: "🤖",
      systemPrompt: "base",
      model: "model-1",
      useKnowledgeBase: true,
      knowledgeBaseGroupIds: [],
      isSystemDefault: false,
      isBuiltIn: false,
      organizationId: "org_1",
      createdBy: null,
      updatedBy: null,
      liveChatEnabled: false,
      avatarS3Key: null,
      modelConfig: null,
      openingMessage: null,
      openingQuestions: [],
      guardRails: null,
      chatConfig: null,
      memoryConfig: null,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await deleteAssistantForUser({
      id: "assistant_org",
      context: { organizationId: "org_1", role: "member" },
    })

    expect(result).toEqual({
      status: 403,
      error: "Insufficient permissions",
    })
  })

  it("lists assistants for the current organization scope", async () => {
    vi.mocked(repository.listAssistantsByScope).mockResolvedValue([
      {
        id: "assistant_1",
        name: "A",
        description: null,
        emoji: "🤖",
        systemPrompt: "prompt",
        model: "model-1",
        useKnowledgeBase: false,
        knowledgeBaseGroupIds: [],
        isSystemDefault: false,
        isBuiltIn: true,
        organizationId: null,
        createdBy: null,
        updatedBy: null,
        liveChatEnabled: false,
        avatarS3Key: null,
        modelConfig: null,
        openingMessage: null,
        openingQuestions: [],
        guardRails: null,
        chatConfig: null,
        memoryConfig: null,
        tags: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        _count: { tools: 3 },
      },
    ] as never)

    const result = await listAssistantsForUser({
      organizationId: "org_1",
      role: "admin",
    })

    expect(result).toEqual([
      expect.objectContaining({
        id: "assistant_1",
        toolCount: 3,
      }),
    ])
  })

  it("creates an assistant for organization", async () => {
    vi.mocked(repository.createAssistant).mockResolvedValue({
      id: "assistant_new",
    } as never)

    const result = await createAssistantForUser({
      userId: "user_1",
      input: {
        name: "New Assistant",
        systemPrompt: "Prompt",
      },
      organizationId: "org_1",
      role: "admin",
    })

    expect(result).toEqual({ id: "assistant_new" })
    expect(repository.createAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Assistant",
        systemPrompt: "Prompt",
        organizationId: "org_1",
        createdBy: "user_1",
      })
    )
  })
})
