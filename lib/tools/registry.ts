import { tool as aiTool } from "ai"
import type { CoreTool } from "ai"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"
import { BUILTIN_TOOLS } from "./builtin"
import { adaptMcpToolsToAiSdk } from "@/lib/mcp/tool-adapter"
import type { McpServerOptions, McpToolInfo } from "@/lib/mcp/client"
import type { ToolContext, ResolvedTools } from "./types"

function getModelById(modelId: string) {
  return AVAILABLE_MODELS.find((m) => m.id === modelId)
}

/**
 * Resolve all enabled tools for an assistant into Vercel AI SDK format.
 * Returns empty if model doesn't support function calling.
 */
export async function resolveToolsForAssistant(
  assistantId: string,
  modelId: string,
  context: ToolContext
): Promise<ResolvedTools> {
  const model = getModelById(modelId)
  if (!model?.capabilities.functionCalling) {
    return { tools: {}, toolNames: [] }
  }

  const assistantTools = await prisma.assistantTool.findMany({
    where: { assistantId, enabled: true },
    include: {
      tool: {
        include: { mcpServer: true },
      },
    },
  })

  const tools: Record<string, CoreTool> = {}
  const toolNames: string[] = []

  for (const at of assistantTools) {
    const toolDef = at.tool
    if (!toolDef.enabled) continue

    if (toolDef.category === "builtin") {
      const builtin = BUILTIN_TOOLS[toolDef.name]
      if (!builtin) continue

      tools[toolDef.name] = aiTool({
        description: toolDef.description,
        inputSchema: builtin.parameters,
        execute: async (params) => {
          const startTime = Date.now()
          try {
            const result = await builtin.execute(
              params as Record<string, unknown>,
              context
            )
            logToolExecution(
              toolDef.name,
              toolDef.id,
              params,
              result,
              context,
              Date.now() - startTime
            ).catch(() => {})
            return result
          } catch (error) {
            logToolExecution(
              toolDef.name,
              toolDef.id,
              params,
              null,
              context,
              Date.now() - startTime,
              error
            ).catch(() => {})
            return {
              error: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            }
          }
        },
      })
      toolNames.push(toolDef.name)
    }

    if (toolDef.category === "mcp" && toolDef.mcpServer) {
      const serverConfig: McpServerOptions = {
        id: toolDef.mcpServer.id,
        name: toolDef.mcpServer.name,
        transport: toolDef.mcpServer.transport as McpServerOptions["transport"],
        url: toolDef.mcpServer.url,
        command: toolDef.mcpServer.command,
        args: toolDef.mcpServer.args,
        env: toolDef.mcpServer.env as Record<string, string> | null,
        headers: toolDef.mcpServer.headers as Record<string, string> | null,
      }

      const mcpToolInfo: McpToolInfo = {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.parameters as object,
      }

      try {
        const adapted = adaptMcpToolsToAiSdk(serverConfig, [mcpToolInfo])
        Object.assign(tools, adapted)
        toolNames.push(...Object.keys(adapted))
      } catch {
        // MCP tool unavailable, skip silently
      }
    }
  }

  return { tools, toolNames }
}

async function logToolExecution(
  toolName: string,
  toolId: string,
  input: unknown,
  output: unknown,
  context: ToolContext,
  durationMs: number,
  error?: unknown
) {
  await prisma.toolExecution.create({
    data: {
      toolName,
      toolId,
      assistantId: context.assistantId,
      sessionId: context.sessionId,
      input: input as object,
      output: output as object | undefined,
      error: error
        ? error instanceof Error
          ? error.message
          : String(error)
        : null,
      durationMs,
      status: error ? "error" : "success",
      organizationId: context.organizationId,
      userId: context.userId,
    },
  })
}
