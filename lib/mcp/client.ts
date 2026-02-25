import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

export interface McpServerOptions {
  id: string
  name: string
  transport: "sse" | "streamable-http"
  url?: string | null
  env?: Record<string, string> | null
  headers?: Record<string, string> | null
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema: object
}

/**
 * Replace `{ENV_KEY}` placeholders in a URL with values from `env`.
 * E.g. `https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/sse` → resolved URL.
 */
export function resolveUrl(
  url: string,
  env?: Record<string, string> | null
): string {
  if (!env) return url
  return url.replace(/\{([A-Z_][A-Z0-9_]*)\}/g, (_match, key: string) => {
    return env[key] ?? `{${key}}`
  })
}

/**
 * Manages MCP client connections with connection pooling.
 * One client per MCP server config, cached with cleanup on disconnect.
 */
class McpClientManager {
  private clients: Map<string, Client> = new Map()

  async connect(config: McpServerOptions): Promise<Client> {
    // Return existing connection if available
    const existing = this.clients.get(config.id)
    if (existing) return existing

    const client = new Client(
      { name: "rantai-agents", version: "1.0.0" },
      { capabilities: {} }
    )

    if (!config.url) {
      throw new Error(
        `Invalid MCP config: transport=${config.transport}, url is required`
      )
    }

    const resolvedUrl = resolveUrl(config.url, config.env)
    const requestInit = config.headers
      ? { headers: config.headers }
      : undefined

    let transport

    if (config.transport === "streamable-http") {
      transport = new StreamableHTTPClientTransport(new URL(resolvedUrl), {
        requestInit,
      })
    } else {
      // SSE transport
      transport = new SSEClientTransport(new URL(resolvedUrl), {
        requestInit,
      })
    }

    await client.connect(transport)
    this.clients.set(config.id, client)
    return client
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      try {
        await client.close()
      } catch {
        // Ignore close errors
      }
      this.clients.delete(serverId)
    }
  }

  async listTools(config: McpServerOptions): Promise<McpToolInfo[]> {
    const client = await this.connect(config)
    const result = await client.listTools()
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as object,
    }))
  }

  async callTool(
    config: McpServerOptions,
    toolName: string,
    args: unknown
  ): Promise<unknown> {
    const client = await this.connect(config)
    const result = await client.callTool({
      name: toolName,
      arguments: args as Record<string, unknown>,
    })

    // Extract text content from MCP response
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
      if (textParts.length === 1) return textParts[0]
      if (textParts.length > 1) return textParts.join("\n")
    }
    return result.content
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.clients.keys())
    await Promise.allSettled(ids.map((id) => this.disconnect(id)))
  }
}

export const mcpClientManager = new McpClientManager()
