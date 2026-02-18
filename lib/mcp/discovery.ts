import { prisma } from "@/lib/prisma"
import { mcpClientManager, type McpServerOptions } from "./client"
import { decryptJsonField } from "@/lib/workflow/credentials"

/**
 * Connect to an MCP server, discover its tools, and sync them to the database.
 * Creates/updates Tool records with category="mcp" and mcpServerId set.
 */
export async function discoverAndSyncTools(serverId: string) {
  const serverConfig = await prisma.mcpServerConfig.findUnique({
    where: { id: serverId },
  })

  if (!serverConfig) {
    throw new Error(`MCP server not found: ${serverId}`)
  }

  const config: McpServerOptions = {
    id: serverConfig.id,
    name: serverConfig.name,
    transport: serverConfig.transport as McpServerOptions["transport"],
    url: serverConfig.url,
    command: serverConfig.command,
    args: serverConfig.args,
    env: decryptJsonField(serverConfig.env),
    headers: decryptJsonField(serverConfig.headers),
  }

  try {
    const mcpTools = await mcpClientManager.listTools(config)

    // Remove tools from this server that no longer exist
    const discoveredNames = mcpTools.map((t) => t.name)
    await prisma.tool.deleteMany({
      where: {
        mcpServerId: serverId,
        name: { notIn: discoveredNames },
      },
    })

    // Upsert each discovered tool
    const tools = []
    for (const mcpTool of mcpTools) {
      const existing = await prisma.tool.findFirst({
        where: { name: mcpTool.name, mcpServerId: serverId },
      })

      if (existing) {
        const updated = await prisma.tool.update({
          where: { id: existing.id },
          data: {
            displayName: mcpTool.name,
            description: mcpTool.description || `MCP tool from ${serverConfig.name}`,
            parameters: mcpTool.inputSchema as object,
          },
        })
        tools.push(updated)
      } else {
        const created = await prisma.tool.create({
          data: {
            name: mcpTool.name,
            displayName: mcpTool.name,
            description: mcpTool.description || `MCP tool from ${serverConfig.name}`,
            category: "mcp",
            parameters: mcpTool.inputSchema as object,
            isBuiltIn: false,
            enabled: true,
            mcpServerId: serverId,
            organizationId: serverConfig.organizationId,
          },
        })
        tools.push(created)
      }
    }

    // Update server status
    await prisma.mcpServerConfig.update({
      where: { id: serverId },
      data: { lastConnectedAt: new Date(), lastError: null },
    })

    return tools
  } catch (error) {
    // Update server with error
    await prisma.mcpServerConfig.update({
      where: { id: serverId },
      data: {
        lastError:
          error instanceof Error ? error.message : "Unknown error",
      },
    })
    throw error
  }
}
