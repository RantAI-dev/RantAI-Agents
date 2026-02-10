import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

export interface McpServerOptions {
  id: string
  name: string
  transport: "stdio" | "sse" | "streamable-http"
  url?: string | null
  command?: string | null
  args?: string[]
  env?: Record<string, string> | null
  headers?: Record<string, string> | null
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema: object
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

    let transport

    if (config.transport === "stdio" && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env
          ? { ...process.env, ...config.env }
          : undefined,
      })
    } else if (
      (config.transport === "sse" || config.transport === "streamable-http") &&
      config.url
    ) {
      transport = new SSEClientTransport(new URL(config.url), {
        requestInit: config.headers
          ? { headers: config.headers }
          : undefined,
      })
    } else {
      throw new Error(
        `Invalid MCP config: transport=${config.transport}, url=${config.url}, command=${config.command}`
      )
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
