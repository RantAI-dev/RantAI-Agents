import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardEmbedKey,
  deleteDashboardEmbedKey,
  getDashboardEmbedKey,
  listDashboardEmbedKeys,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDashboardEmbedApiKey: vi.fn(),
  deleteDashboardEmbedApiKey: vi.fn(),
  findDashboardAssistantById: vi.fn(),
  findDashboardAssistantsByIds: vi.fn(),
  findDashboardEmbedApiKeyById: vi.fn(),
  findDashboardEmbedApiKeysByOrganization: vi.fn(),
  findDashboardOrganizationById: vi.fn(),
  updateDashboardEmbedApiKey: vi.fn(),
}))

vi.mock("@/lib/embed/api-key-generator", () => ({
  generateApiKey: vi.fn(() => "rantai_live_test"),
}))

describe("dashboard-embed-keys service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists keys", async () => {
    vi.mocked(repository.findDashboardEmbedApiKeysByOrganization).mockResolvedValue([
      {
        id: "key_1",
        name: "Key",
        key: "rantai_live_test",
        assistantId: "assistant_1",
        allowedDomains: [],
        config: {},
        requestCount: 0,
        lastUsedAt: null,
        enabled: true,
        organizationId: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)
    vi.mocked(repository.findDashboardAssistantsByIds).mockResolvedValue([
      { id: "assistant_1", name: "Assistant", emoji: "🤖" },
    ] as never)

    const result = await listDashboardEmbedKeys({
      organizationId: null,
      role: null,
      userId: "user_1",
    })

    expect(Array.isArray(result)).toBe(true)
    expect((result as never[])[0]).toMatchObject({ assistantId: "assistant_1" })
  })

  it("returns 404 for missing key", async () => {
    vi.mocked(repository.findDashboardEmbedApiKeyById).mockResolvedValue(null)

    await expect(
      getDashboardEmbedKey(
        { organizationId: null, role: null, userId: "user_1" },
        "key_1"
      )
    ).resolves.toEqual({ status: 404, error: "Embed key not found" })
  })

  it("creates keys", async () => {
    vi.mocked(repository.findDashboardAssistantById).mockResolvedValue({
      id: "assistant_1",
      name: "Assistant",
      emoji: "🤖",
      organizationId: null,
      isBuiltIn: true,
    } as never)
    vi.mocked(repository.createDashboardEmbedApiKey).mockResolvedValue({
      id: "key_1",
      name: "Key",
      key: "rantai_live_test",
      assistantId: "assistant_1",
      allowedDomains: [],
      config: {},
      requestCount: 0,
      lastUsedAt: null,
      enabled: true,
      organizationId: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await createDashboardEmbedKey({
      context: { organizationId: null, role: null, userId: "user_1" },
      input: { name: "Key", assistantId: "assistant_1" },
    })

    expect(result).toMatchObject({ id: "key_1" })
  })

  it("deletes keys", async () => {
    vi.mocked(repository.findDashboardEmbedApiKeyById).mockResolvedValue({
      id: "key_1",
      name: "Key",
      key: "rantai_live_test",
      assistantId: "assistant_1",
      allowedDomains: [],
      config: {},
      requestCount: 0,
      lastUsedAt: null,
      enabled: true,
      organizationId: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await deleteDashboardEmbedKey(
      { organizationId: null, role: null, userId: "user_1" },
      "key_1"
    )
    expect(result).toEqual({ success: true })
  })
})
