import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardMcpApiKeyRecord,
  deleteDashboardMcpApiKeyRecord,
  getDashboardMcpApiKey,
  listDashboardMcpApiKeys,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDashboardMcpApiKey: vi.fn(),
  deleteDashboardMcpApiKey: vi.fn(),
  findDashboardMcpApiKeyById: vi.fn(),
  findDashboardMcpApiKeys: vi.fn(),
  updateDashboardMcpApiKey: vi.fn(),
}))

vi.mock("@/lib/mcp/api-key", () => ({
  generateMcpApiKey: vi.fn(() => "rantai_mcp_test"),
}))

describe("dashboard-mcp-api-keys service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists keys", async () => {
    vi.mocked(repository.findDashboardMcpApiKeys).mockResolvedValue([
      {
        id: "key_1",
        name: "MCP",
        key: "rantai_mcp_test",
        exposedTools: [],
        requestCount: 0,
        lastUsedAt: null,
        enabled: true,
        organizationId: "org_1",
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never)

    const result = await listDashboardMcpApiKeys({
      organizationId: "org_1",
      role: "owner",
      userId: "user_1",
    })

    expect(Array.isArray(result)).toBe(true)
  })

  it("returns 404 for missing keys", async () => {
    vi.mocked(repository.findDashboardMcpApiKeyById).mockResolvedValue(null)

    await expect(
      getDashboardMcpApiKey(
        { organizationId: "org_1", role: "owner", userId: "user_1" },
        "key_1"
      )
    ).resolves.toEqual({ status: 404, error: "MCP API key not found" })
  })

  it("creates keys", async () => {
    vi.mocked(repository.createDashboardMcpApiKey).mockResolvedValue({
      id: "key_1",
      name: "MCP",
      key: "rantai_mcp_test",
      exposedTools: [],
      requestCount: 0,
      lastUsedAt: null,
      enabled: true,
      organizationId: "org_1",
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await createDashboardMcpApiKeyRecord({
      context: { organizationId: "org_1", role: "owner", userId: "user_1" },
      input: { name: "MCP" },
    })

    expect(result).toMatchObject({ id: "key_1" })
  })

  it("deletes keys", async () => {
    vi.mocked(repository.findDashboardMcpApiKeyById).mockResolvedValue({
      id: "key_1",
      name: "MCP",
      key: "rantai_mcp_test",
      exposedTools: [],
      requestCount: 0,
      lastUsedAt: null,
      enabled: true,
      organizationId: "org_1",
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await deleteDashboardMcpApiKeyRecord(
      { organizationId: "org_1", role: "owner", userId: "user_1" },
      "key_1"
    )

    expect(result).toEqual({ success: true })
  })
})
