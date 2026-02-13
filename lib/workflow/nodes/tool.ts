import { NodeType, type WorkflowNodeData, type CodeNodeData, type HttpNodeData, type ToolNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { buildTemplateContext } from "../engine"
import { resolveTemplate, resolveObjectTemplates } from "../template-engine"
import { decryptCredential, credentialToHeaders, type CredentialType } from "../credentials"
import { prisma } from "@/lib/prisma"
import { BUILTIN_TOOLS } from "@/lib/tools/builtin"
import { mcpClientManager, type McpServerOptions } from "@/lib/mcp/client"

/**
 * Retry helper with exponential backoff.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const waitTime = delayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  }
  throw lastError || new Error("Retry failed")
}

/**
 * Fetch with timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw err
  }
}

/**
 * Resolve credential headers for a node with an optional credentialId.
 */
async function resolveCredentialHeaders(credentialId?: string): Promise<Record<string, string>> {
  if (!credentialId) return {}
  try {
    const credential = await prisma.credential.findUnique({ where: { id: credentialId } })
    if (!credential) return {}
    const data = decryptCredential(credential.encryptedData)
    return credentialToHeaders(credential.type as CredentialType, data)
  } catch {
    return {} // Fail gracefully — don't break the workflow for credential issues
  }
}

/**
 * Tool / MCP Tool / Code / HTTP node handler.
 */
export async function executeTool(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const tctx = buildTemplateContext(data.label, data.nodeType, input, context)

  switch (data.nodeType) {
    case NodeType.CODE: {
      const codeData = data as CodeNodeData
      try {
        const vm = await import("vm")
        const sandbox = {
          input,
          $flow: context.flow,
          console: { log: () => {}, warn: () => {}, error: () => {} },
          JSON,
          Math,
          Date,
          Array,
          Object,
          String,
          Number,
          Boolean,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
          undefined,
        }
        const wrappedCode = `(function() { ${codeData.code} })()`
        const result = vm.runInNewContext(wrappedCode, sandbox, { timeout: 5000 })
        return { output: result }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Script execution timed out")) {
          throw new Error("Code execution timed out (5s limit)")
        }
        throw new Error(`Code execution error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    case NodeType.HTTP: {
      const httpData = data as HttpNodeData
      const url = resolveTemplate(httpData.url || "", tctx)
      if (!url) throw new Error("HTTP node: URL is required")

      const resolvedHeaders = httpData.headers
        ? resolveObjectTemplates(httpData.headers, tctx) as Record<string, string>
        : {}

      const credHeaders = await resolveCredentialHeaders(httpData.credentialId)

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...credHeaders,
        ...resolvedHeaders, // User-specified headers take priority over credential headers
      }

      const fetchOptions: RequestInit = {
        method: httpData.method,
        headers,
      }

      if (httpData.method !== "GET" && httpData.body) {
        fetchOptions.body = resolveTemplate(httpData.body, tctx)
      }

      // Apply timeout (default: 30s) and retry (default: 0)
      const timeout = httpData.timeout ?? 30000
      const maxRetries = httpData.maxRetries ?? 0

      const response = await retryWithBackoff(
        () => fetchWithTimeout(url, fetchOptions, timeout),
        maxRetries
      )

      const contentType = response.headers.get("content-type") || ""

      // Handle response based on responseType or auto-detect
      let responseData: unknown
      const responseType = httpData.responseType || "auto"

      if (responseType === "json" || (responseType === "auto" && contentType.includes("application/json"))) {
        responseData = await response.json()
      } else if (responseType === "blob") {
        // For blob, return base64 encoded string
        const blob = await response.blob()
        const buffer = await blob.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        responseData = { type: blob.type, size: blob.size, base64 }
      } else {
        responseData = await response.text()
      }

      return {
        output: {
          status: response.status,
          data: responseData,
          headers: Object.fromEntries(response.headers.entries()),
        },
      }
    }

    case NodeType.TOOL: {
      const toolData = data as ToolNodeData
      const resolvedInput = resolveObjectTemplates(toolData.inputMapping || {}, tctx)

      // Load tool from database
      const toolRecord = await prisma.tool.findFirst({
        where: {
          OR: [
            ...(toolData.toolId ? [{ id: toolData.toolId }] : []),
            ...(toolData.toolName ? [{ name: toolData.toolName }] : []),
          ],
          enabled: true,
        },
      })

      if (!toolRecord) {
        throw new Error(`Tool "${toolData.toolId || toolData.toolName}" not found or disabled`)
      }

      // Builtin tool
      if (toolRecord.category === "builtin") {
        const builtin = BUILTIN_TOOLS[toolRecord.name]
        if (!builtin) throw new Error(`Builtin tool "${toolRecord.name}" not found in registry`)

        const result = await builtin.execute(
          resolvedInput as Record<string, unknown>,
          { sessionId: context.runId }
        )

        // Log execution
        await prisma.toolExecution.create({
          data: {
            toolId: toolRecord.id,
            toolName: toolRecord.name,
            input: JSON.parse(JSON.stringify(resolvedInput)),
            output: result ? JSON.parse(JSON.stringify(result)) : undefined,
            status: "success",
            durationMs: 0,
          },
        }).catch(() => {}) // Non-critical, don't fail workflow

        return { output: result }
      }

      // Custom tool (HTTP-based)
      if (toolRecord.category === "custom") {
        const config = toolRecord.executionConfig as { url?: string; method?: string; headers?: Record<string, string> } | null
        if (!config?.url) throw new Error(`Custom tool "${toolRecord.name}" has no URL configured`)

        const response = await fetch(config.url, {
          method: config.method || "POST",
          headers: { "Content-Type": "application/json", ...(config.headers || {}) },
          body: JSON.stringify(resolvedInput),
        })

        const result = await response.json().catch(() => response.text())
        return { output: result }
      }

      throw new Error(`Unsupported tool category: ${toolRecord.category}`)
    }

    case NodeType.MCP_TOOL: {
      const toolData = data as ToolNodeData
      const resolvedInput = resolveObjectTemplates(toolData.inputMapping || {}, tctx)

      // Load MCP tool from database with its server config
      const toolRecord = await prisma.tool.findFirst({
        where: {
          OR: [
            ...(toolData.toolId ? [{ id: toolData.toolId }] : []),
            ...(toolData.toolName ? [{ name: toolData.toolName }] : []),
          ],
          category: "mcp",
        },
        include: { mcpServer: true },
      })

      if (!toolRecord?.mcpServer) {
        throw new Error(`MCP tool "${toolData.toolId || toolData.toolName}" not found or no server configured`)
      }

      const serverConfig: McpServerOptions = {
        id: toolRecord.mcpServer.id,
        name: toolRecord.mcpServer.name,
        transport: toolRecord.mcpServer.transport as "stdio" | "sse" | "streamable-http",
        url: toolRecord.mcpServer.url,
        command: toolRecord.mcpServer.command,
        args: (toolRecord.mcpServer.args as string[]) || undefined,
        env: toolRecord.mcpServer.env as Record<string, string> | null,
        headers: toolRecord.mcpServer.headers as Record<string, string> | null,
      }

      const result = await mcpClientManager.callTool(
        serverConfig,
        toolData.toolName || toolRecord.name,
        resolvedInput
      )

      return { output: result }
    }

    default:
      return { output: input }
  }
}
