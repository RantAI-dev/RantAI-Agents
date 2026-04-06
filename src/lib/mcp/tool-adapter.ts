import { tool as aiTool } from "ai"
import { jsonSchema } from "ai"
import type { ToolSet } from "ai"
import { mcpClientManager, type McpServerOptions, type McpToolInfo } from "./client"

/**
 * Convert MCP tools into AI SDK tool format.
 * Each tool's execute() delegates to mcpClientManager.callTool().
 */
export function adaptMcpToolsToAiSdk(
  serverConfig: McpServerOptions,
  mcpTools: McpToolInfo[]
): ToolSet {
  const tools: ToolSet = {}

  for (const mcpTool of mcpTools) {
    const toolName = `mcp_${serverConfig.id}_${mcpTool.name}`

    tools[toolName] = aiTool({
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      execute: async (params) => {
        try {
          return await mcpClientManager.callTool(
            serverConfig,
            mcpTool.name,
            params
          )
        } catch (error) {
          return {
            error: `MCP tool ${mcpTool.name} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          }
        }
      },
    })
  }

  return tools
}
