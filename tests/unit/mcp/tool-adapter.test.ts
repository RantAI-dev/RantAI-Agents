import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/mcp/client", () => ({
  mcpClientManager: {
    callTool: vi.fn(),
  },
  resolveUrl: vi.fn((url: string) => url),
}))

import { adaptMcpToolsToAiSdk } from "@/lib/mcp/tool-adapter"
import { mcpClientManager } from "@/lib/mcp/client"
import type { McpServerOptions, McpToolInfo } from "@/lib/mcp/client"

const baseConfig: McpServerOptions = {
  id: "test-server",
  name: "Test Server",
  transport: "sse",
  url: "https://example.com/sse",
}

const sampleTool: McpToolInfo = {
  name: "search",
  description: "Search the web",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── adaptMcpToolsToAiSdk ─────────────────────────────────────────────────────

describe("adaptMcpToolsToAiSdk", () => {
  it("names tools as mcp_{serverId}_{toolName}", () => {
    const tools = adaptMcpToolsToAiSdk(baseConfig, [sampleTool])
    expect(tools).toHaveProperty("mcp_test-server_search")
  })

  it("returns an empty object for an empty tool list", () => {
    const tools = adaptMcpToolsToAiSdk(baseConfig, [])
    expect(tools).toEqual({})
  })

  it("works with tools that have no description", () => {
    const toolWithoutDescription: McpToolInfo = {
      name: "ping",
      inputSchema: { type: "object", properties: {} },
    }
    const tools = adaptMcpToolsToAiSdk(baseConfig, [toolWithoutDescription])
    const adapted = tools["mcp_test-server_ping"]
    expect(adapted).toBeDefined()
    expect(adapted.description).toBe("MCP tool: ping")
  })

  it("execute delegates to mcpClientManager.callTool", async () => {
    const mockResult = "search result"
    vi.mocked(mcpClientManager.callTool).mockResolvedValueOnce(mockResult)

    const tools = adaptMcpToolsToAiSdk(baseConfig, [sampleTool])
    const adapted = tools["mcp_test-server_search"]

    const result = await adapted.execute!({ query: "hello" }, {
      toolName: "mcp_test-server_search",
      toolCallId: "call-1",
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    })

    expect(mcpClientManager.callTool).toHaveBeenCalledWith(
      baseConfig,
      "search",
      { query: "hello" }
    )
    expect(result).toBe(mockResult)
  })

  it("execute wraps errors gracefully", async () => {
    vi.mocked(mcpClientManager.callTool).mockRejectedValueOnce(
      new Error("network timeout")
    )

    const tools = adaptMcpToolsToAiSdk(baseConfig, [sampleTool])
    const adapted = tools["mcp_test-server_search"]

    const result = await adapted.execute!({ query: "hello" }, {
      toolName: "mcp_test-server_search",
      toolCallId: "call-2",
      messages: [],
      abortSignal: undefined as unknown as AbortSignal,
    })

    expect(result).toEqual({
      error: "MCP tool search failed: network timeout",
    })
  })
})
