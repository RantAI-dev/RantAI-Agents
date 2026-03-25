import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteDashboardTool,
  getDashboardToolById,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createTool: vi.fn(),
  deleteToolById: vi.fn(),
  findToolById: vi.fn(),
  findToolByIdBasic: vi.fn(),
  findToolsForOrganization: vi.fn(),
  updateToolById: vi.fn(),
}))

describe("dashboard-tools service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("redacts authValue in execution config", async () => {
    vi.mocked(repository.findToolById).mockResolvedValue({
      id: "tool_1",
      name: "tool_1",
      displayName: "Tool",
      description: "desc",
      category: "custom",
      parameters: {},
      icon: null,
      tags: [],
      isBuiltIn: false,
      enabled: true,
      executionConfig: { authValue: "secret", url: "https://example.com" },
      mcpServerId: null,
      openApiSpecId: null,
      organizationId: "org_1",
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
      mcpServer: null,
      _count: { assistantTools: 0 },
    })

    const result = await getDashboardToolById({
      id: "tool_1",
      organizationId: "org_1",
    })

    expect(result).toMatchObject({
      executionConfig: { authValue: "••••••••", url: "https://example.com" },
    })
  })

  it("blocks deletion for built-in tools", async () => {
    vi.mocked(repository.findToolByIdBasic).mockResolvedValue({
      id: "builtin_tool",
      name: "builtin_tool",
      displayName: "Built-in",
      description: "desc",
      category: "builtin",
      parameters: {},
      icon: null,
      tags: [],
      isBuiltIn: true,
      enabled: true,
      executionConfig: null,
      mcpServerId: null,
      openApiSpecId: null,
      organizationId: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await deleteDashboardTool({
      id: "builtin_tool",
      organizationId: null,
    })

    expect(result).toEqual({
      status: 403,
      error: "Cannot delete built-in tools",
    })
  })
})
