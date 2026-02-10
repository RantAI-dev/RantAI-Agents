import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { prisma } from "@/lib/prisma"
import { createMcpServer } from "@/lib/mcp/server"
import { validateMcpApiKeyFormat } from "@/lib/mcp/api-key"
import type { ToolContext } from "@/lib/tools/types"

/**
 * Authenticate an MCP request via Bearer token.
 * Returns the McpApiKey record or null.
 */
async function authenticateMcpRequest(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null

  const key = authHeader.slice(7)
  if (!validateMcpApiKeyFormat(key)) return null

  const apiKey = await prisma.mcpApiKey.findFirst({
    where: { key, enabled: true },
  })

  return apiKey
}

/**
 * Handle MCP protocol requests (POST, GET, DELETE).
 */
async function handleMcpRequest(req: Request): Promise<Response> {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }

  const context: ToolContext = {
    organizationId: apiKey.organizationId,
  }

  const mcpServer = createMcpServer(apiKey.exposedTools, context)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  })

  await mcpServer.connect(transport)

  // Update usage stats (non-blocking)
  prisma.mcpApiKey
    .update({
      where: { id: apiKey.id },
      data: {
        requestCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    })
    .catch(() => {})

  return transport.handleRequest(req)
}

export async function POST(req: Request) {
  return handleMcpRequest(req)
}

export async function GET(req: Request) {
  return handleMcpRequest(req)
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req)
}

export async function OPTIONS() {
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
