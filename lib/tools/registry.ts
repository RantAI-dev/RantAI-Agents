import { tool as aiTool, jsonSchema } from "ai"
import type { CoreTool } from "ai"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"
import { BUILTIN_TOOLS } from "./builtin"
import { adaptMcpToolsToAiSdk } from "@/lib/mcp/tool-adapter"
import type { McpServerOptions, McpToolInfo } from "@/lib/mcp/client"
import type { ToolContext, ResolvedTools, ExecutionConfig } from "./types"

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

    if (toolDef.category === "custom" || toolDef.category === "openapi") {
      const config = toolDef.executionConfig as ExecutionConfig | null
      if (!config?.url) {
        console.warn(`[Tools] Custom tool "${toolDef.name}" has no URL, skipping`)
        continue
      }

      const authHeaders: Record<string, string> = {}
      if (config.authType === "bearer" && config.authValue) {
        authHeaders["Authorization"] = `Bearer ${config.authValue}`
      } else if (config.authType === "api_key" && config.authValue) {
        authHeaders[config.authHeaderName || "X-API-Key"] = config.authValue
      }

      tools[toolDef.name] = aiTool({
        description: toolDef.description,
        inputSchema: jsonSchema(
          toolDef.parameters as Parameters<typeof jsonSchema>[0]
        ),
        execute: async (params) => {
          const startTime = Date.now()
          const timeoutMs = config.timeoutMs || 30000
          try {
            const parsed = new URL(config.url)
            if (!["http:", "https:"].includes(parsed.protocol)) {
              throw new Error(`Invalid protocol: ${parsed.protocol}`)
            }

            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), timeoutMs)
            try {
              const method = config.method || "POST"
              const opts: RequestInit = {
                method,
                headers: {
                  "Content-Type": "application/json",
                  ...(config.headers || {}),
                  ...authHeaders,
                },
                signal: controller.signal,
              }
              if (method !== "GET" && method !== "DELETE") {
                opts.body = JSON.stringify(params)
              }
              const res = await fetch(config.url, opts)
              clearTimeout(timer)
              if (!res.ok) {
                const errText = await res.text().catch(() => "Unknown")
                throw new Error(`HTTP ${res.status}: ${errText.substring(0, 500)}`)
              }
              const result = await res.json().catch(() => res.text())
              logToolExecution(toolDef.name, toolDef.id, params, result, context, Date.now() - startTime).catch(() => {})
              return result
            } catch (err) {
              clearTimeout(timer)
              if ((err as Error).name === "AbortError") {
                throw new Error(`Timed out after ${timeoutMs}ms`)
              }
              throw err
            }
          } catch (error) {
            logToolExecution(toolDef.name, toolDef.id, params, null, context, Date.now() - startTime, error).catch(() => {})
            return {
              error: `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            }
          }
        },
      })
      toolNames.push(toolDef.name)
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
