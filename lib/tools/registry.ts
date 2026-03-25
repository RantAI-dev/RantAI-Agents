import { tool as aiTool, jsonSchema } from "ai"
import type { ToolSet } from "ai"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"
import { BUILTIN_TOOLS } from "./builtin"
import { adaptMcpToolsToAiSdk } from "@/lib/mcp/tool-adapter"
import type { McpServerOptions, McpToolInfo } from "@/lib/mcp/client"
import { decryptJsonField } from "@/lib/workflow/credentials"
import type { ToolContext, ResolvedTools, ExecutionConfig } from "./types"
import {
  getCommunityTool,
  executeCommunityTool,
} from "@/lib/skills/gateway"
import type { CommunityToolContext } from "@/lib/skill-sdk"
import { workflowEngine } from "@/lib/workflow"
import type { WorkflowVariables } from "@/lib/workflow/types"

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

  const tools: ToolSet = {}
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
        env: decryptJsonField(toolDef.mcpServer.env),
        headers: decryptJsonField(toolDef.mcpServer.headers),
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

    if (toolDef.category === "community") {
      const communityTool = await getCommunityTool(toolDef.name)
      if (!communityTool) {
        console.warn(
          `[Tools] Community tool "${toolDef.name}" not found in registry, skipping`
        )
        continue
      }

      // Load user config from InstalledSkill that references this tool
      let userConfig: Record<string, unknown> | undefined
      const skillsUsingTool = await prisma.skill.findMany({
        where: {
          assistantSkills: { some: { assistantId, enabled: true } },
        },
        select: { metadata: true, installedSkill: { select: { config: true } } },
      })
      for (const skill of skillsUsingTool) {
        const meta = (skill.metadata ?? {}) as Record<string, unknown>
        const toolIds = Array.isArray(meta.toolIds) ? meta.toolIds : []
        if (toolIds.includes(toolDef.id) && skill.installedSkill?.config) {
          userConfig = skill.installedSkill.config as Record<string, unknown>
          break
        }
      }

      const communityCtx: CommunityToolContext = {
        ...context,
        config: userConfig,
      }

      tools[toolDef.name] = aiTool({
        description: toolDef.description,
        inputSchema: communityTool.parameters,
        execute: async (params) => {
          const startTime = Date.now()
          try {
            const result = await executeCommunityTool(
              toolDef.name,
              params as Record<string, unknown>,
              communityCtx
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
  }

  // Resolve MCP servers bound at the assistant level (AssistantMcpServer)
  const assistantMcpServers = await prisma.assistantMcpServer.findMany({
    where: { assistantId, enabled: true },
    include: {
      mcpServer: {
        include: { tools: true },
      },
    },
  })

  for (const binding of assistantMcpServers) {
    const server = binding.mcpServer
    if (!server.enabled) continue

    const serverConfig: McpServerOptions = {
      id: server.id,
      name: server.name,
      transport: server.transport as McpServerOptions["transport"],
      url: server.url,
      env: decryptJsonField(server.env),
      headers: decryptJsonField(server.headers),
    }

    // Build tool infos from the server's discovered tools
    const mcpToolInfos: McpToolInfo[] = server.tools
      .filter((t) => t.enabled)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters as object,
      }))

    if (mcpToolInfos.length === 0) continue

    try {
      const adapted = adaptMcpToolsToAiSdk(serverConfig, mcpToolInfos)
      // Skip tools already added from AssistantTool to avoid duplicates
      for (const [name, tool] of Object.entries(adapted)) {
        if (!tools[name]) {
          tools[name] = tool
          toolNames.push(name)
        }
      }
    } catch {
      // MCP server unavailable, skip silently
    }
  }

  // ── Resolve TASK workflows bound to this assistant as callable tools ──
  const assistantWorkflows = await prisma.assistantWorkflow.findMany({
    where: { assistantId, enabled: true },
    include: { workflow: true },
  })

  for (const binding of assistantWorkflows) {
    const wf = binding.workflow
    if (wf.category !== "TASK" || wf.status !== "ACTIVE") continue

    const toolName = `workflow_${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`
    if (tools[toolName]) continue // avoid duplicates

    const variables = (wf.variables as unknown as WorkflowVariables) || null
    const schema = buildWorkflowToolSchema(variables)

    tools[toolName] = aiTool({
      description: `Execute workflow: ${wf.name}. ${wf.description || ""}`.trim(),
      inputSchema: jsonSchema(schema),
      execute: async (params) => {
        const startTime = Date.now()
        try {
          const runId = await workflowEngine.execute(
            wf.id,
            params as Record<string, unknown>,
            { userId: context.userId, organizationId: context.organizationId }
          )
          const run = await prisma.workflowRun.findUnique({
            where: { id: runId },
            select: { status: true, output: true },
          })
          const result = {
            runId,
            status: run?.status ?? "UNKNOWN",
            output: run?.output ?? null,
          }
          logToolExecution(toolName, wf.id, params, result, context, Date.now() - startTime).catch(() => {})
          if (run?.status === "PAUSED") {
            return {
              ...result,
              message: "Workflow is awaiting human input. The user will need to provide input or approval before it can continue.",
            }
          }
          return result
        } catch (error) {
          logToolExecution(toolName, wf.id, params, null, context, Date.now() - startTime, error).catch(() => {})
          return {
            error: `Workflow execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          }
        }
      },
    })
    toolNames.push(toolName)
  }

  return { tools, toolNames }
}

/**
 * Resolve enabled tools by explicit tool names (on-demand chat override),
 * independent from assistant bindings.
 */
export async function resolveToolsByNames(
  requestedToolNames: string[],
  assistantId: string | null,
  modelId: string,
  context: ToolContext
): Promise<ResolvedTools> {
  const model = getModelById(modelId)
  if (!model?.capabilities.functionCalling || requestedToolNames.length === 0) {
    return { tools: {}, toolNames: [] }
  }

  const toolDefs = await prisma.tool.findMany({
    where: {
      name: { in: requestedToolNames },
      enabled: true,
      OR: [
        { organizationId: null, isBuiltIn: true },
        ...(context.organizationId ? [{ organizationId: context.organizationId }] : []),
        ...(context.userId
          ? [
              {
                organization: {
                  memberships: {
                    some: {
                      userId: context.userId,
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    include: { mcpServer: true },
  })

  const tools: ToolSet = {}
  const toolNames: string[] = []

  for (const toolDef of toolDefs) {
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
      continue
    }

    if (toolDef.category === "mcp" && toolDef.mcpServer) {
      const serverConfig: McpServerOptions = {
        id: toolDef.mcpServer.id,
        name: toolDef.mcpServer.name,
        transport: toolDef.mcpServer.transport as McpServerOptions["transport"],
        url: toolDef.mcpServer.url,
        env: decryptJsonField(toolDef.mcpServer.env),
        headers: decryptJsonField(toolDef.mcpServer.headers),
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
      continue
    }

    if (toolDef.category === "custom" || toolDef.category === "openapi") {
      const config = toolDef.executionConfig as ExecutionConfig | null
      if (!config?.url) {
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
      continue
    }

    if (toolDef.category === "community") {
      const communityTool = await getCommunityTool(toolDef.name)
      if (!communityTool) {
        continue
      }

      let userConfig: Record<string, unknown> | undefined
      if (assistantId) {
        const skillsUsingTool = await prisma.skill.findMany({
          where: {
            assistantSkills: { some: { assistantId, enabled: true } },
          },
          select: { metadata: true, installedSkill: { select: { config: true } } },
        })
        for (const skill of skillsUsingTool) {
          const meta = (skill.metadata ?? {}) as Record<string, unknown>
          const toolIds = Array.isArray(meta.toolIds) ? meta.toolIds : []
          if (toolIds.includes(toolDef.id) && skill.installedSkill?.config) {
            userConfig = skill.installedSkill.config as Record<string, unknown>
            break
          }
        }
      }

      const communityCtx: CommunityToolContext = {
        ...context,
        config: userConfig,
      }

      tools[toolDef.name] = aiTool({
        description: toolDef.description,
        inputSchema: communityTool.parameters,
        execute: async (params) => {
          const startTime = Date.now()
          try {
            const result = await executeCommunityTool(
              toolDef.name,
              params as Record<string, unknown>,
              communityCtx
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
  }

  return { tools, toolNames }
}

function buildWorkflowToolSchema(
  variables: WorkflowVariables | null
): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
  }

  if (!variables?.inputs?.length) {
    return {
      type: "object" as const,
      properties: {
        input: { type: "string", description: "Input for the workflow" },
      },
    }
  }

  const properties: Record<string, Record<string, unknown>> = {}
  const required: string[] = []

  for (const v of variables.inputs) {
    properties[v.name] = {
      type: typeMap[v.type] || "string",
      ...(v.description && { description: v.description }),
    }
    if (v.required) {
      required.push(v.name)
    }
  }

  return {
    type: "object" as const,
    properties,
    ...(required.length > 0 && { required }),
  }
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
