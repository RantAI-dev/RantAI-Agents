import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardMcpServerForDashboard,
  deleteDashboardMcpServerForDashboard,
  discoverDashboardMcpServerTools,
  getDashboardMcpServerForDashboard,
  listDashboardMcpServers,
  updateDashboardMcpServerForDashboard,
} from "./service"
import * as repository from "./repository"
import * as mcp from "@/lib/mcp"

vi.mock("./repository", () => ({
  createDashboardMcpServer: vi.fn(),
  deleteDashboardMcpServer: vi.fn(),
  findDashboardMcpServerById: vi.fn(),
  findDashboardMcpServers: vi.fn(),
  updateDashboardMcpServer: vi.fn(),
}))

vi.mock("@/lib/mcp", () => ({
  discoverAndSyncTools: vi.fn(),
}))

describe("dashboard MCP servers service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists organization MCP servers", async () => {
    vi.mocked(repository.findDashboardMcpServers).mockResolvedValue([
      {
        id: "server_1",
        name: "Atlas",
        description: null,
        icon: null,
        transport: "sse",
        url: "http://localhost",
        isBuiltIn: false,
        envKeys: [],
        docsUrl: null,
        enabled: true,
        configured: true,
        lastConnectedAt: null,
        lastError: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        _count: { tools: 2 },
      },
    ] as never)

    const result = await listDashboardMcpServers("org_1")

    expect(result).toEqual([
      expect.objectContaining({
        id: "server_1",
        toolCount: 2,
      }),
    ])
  })

  it("returns 404 for a missing MCP server", async () => {
    vi.mocked(repository.findDashboardMcpServerById).mockResolvedValue(null)

    const result = await getDashboardMcpServerForDashboard({
      id: "server_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ status: 404, error: "MCP server not found" })
  })

  it("blocks deletion of built-in MCP servers", async () => {
    vi.mocked(repository.findDashboardMcpServerById).mockResolvedValue({
      isBuiltIn: true,
      organizationId: null,
    } as never)

    const result = await deleteDashboardMcpServerForDashboard({
      id: "server_1",
      organizationId: null,
    })

    expect(result).toEqual({
      status: 403,
      error: "Cannot delete a built-in MCP server",
    })
  })

  it("updates an MCP server and strips secrets", async () => {
    vi.mocked(repository.findDashboardMcpServerById).mockResolvedValue({
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.updateDashboardMcpServer).mockResolvedValue({
      id: "server_1",
      env: { _encrypted: "abc" },
      headers: null,
      _count: { tools: 0 },
    } as never)

    const result = await updateDashboardMcpServerForDashboard({
      id: "server_1",
      organizationId: "org_1",
      input: { enabled: false } as never,
    })

    expect(result).toEqual(
      expect.objectContaining({
        id: "server_1",
        hasEnv: true,
        hasHeaders: false,
      })
    )
  })

  it("delegates discovery to the shared MCP helper", async () => {
    vi.mocked(mcp.discoverAndSyncTools).mockResolvedValue([
      {
        id: "tool_1",
        name: "tool-1",
        displayName: "Tool 1",
        description: "Desc",
      },
    ] as never)

    const result = await discoverDashboardMcpServerTools("server_1")

    expect(result).toEqual({
      success: true,
      toolCount: 1,
      tools: [
        {
          id: "tool_1",
          name: "tool-1",
          displayName: "Tool 1",
          description: "Desc",
        },
      ],
    })
  })
})
