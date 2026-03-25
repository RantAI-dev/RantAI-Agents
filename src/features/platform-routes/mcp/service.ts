import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { McpApiKey } from "@prisma/client"
import { validateMcpApiKeyFormat } from "@/lib/mcp/api-key"
import { createMcpServer } from "@/lib/mcp/server"
import type { ToolContext } from "@/lib/tools/types"
import {
  findEnabledMcpApiKeyByValue,
  incrementMcpApiKeyUsage,
} from "./repository"
import { McpAuthorizationHeaderSchema } from "./schema"

export interface McpServiceDependencies {
  createTransport?: () => WebStandardStreamableHTTPServerTransport
  createServer?: typeof createMcpServer
}

function getDeps(deps?: McpServiceDependencies) {
  return {
    createTransport:
      deps?.createTransport ||
      (() =>
        new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        })),
    createServer: deps?.createServer ?? createMcpServer,
  }
}

function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  )
}

async function authenticateMcpRequest(req: Request): Promise<McpApiKey | null> {
  const parsedHeaders = McpAuthorizationHeaderSchema.safeParse({
    authorization: req.headers.get("authorization") || undefined,
  })
  const authHeader = parsedHeaders.success ? parsedHeaders.data.authorization : undefined
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }

  const key = authHeader.slice(7)
  if (!validateMcpApiKeyFormat(key)) {
    return null
  }

  return findEnabledMcpApiKeyByValue(key)
}

/**
 * Handles MCP GET/POST/DELETE protocol requests using stateless transports.
 */
export async function handleMcpRequest(req: Request, deps?: McpServiceDependencies): Promise<Response> {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return unauthorizedResponse()
  }

  const { createTransport, createServer } = getDeps(deps)
  const context: ToolContext = {
    organizationId: apiKey.organizationId,
  }

  const mcpServer = createServer(apiKey.exposedTools, context)
  const transport = createTransport()

  await mcpServer.connect(transport)

  incrementMcpApiKeyUsage(apiKey.id).catch(() => {
    // Usage metrics should never block MCP protocol responses.
  })

  return transport.handleRequest(req)
}

export function handleMcpOptionsRequest(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    },
  })
}
