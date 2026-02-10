import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { BUILTIN_TOOLS } from "@/lib/tools/builtin"
import type { ToolDefinition, ToolContext } from "@/lib/tools/types"
import type { z } from "zod"

/**
 * Create a fresh McpServer with the specified builtin tools registered.
 * Each request gets its own server instance (stateless per-request model).
 */
export function createMcpServer(
  enabledToolNames: string[],
  context: ToolContext
): McpServer {
  const server = new McpServer(
    { name: "rantai-tools", version: "1.0.0" },
    { capabilities: { tools: {} } }
  )

  // Determine which tools to register
  const toolEntries =
    enabledToolNames.length > 0
      ? enabledToolNames
          .map((name) => [name, BUILTIN_TOOLS[name]] as const)
          .filter((entry): entry is [string, ToolDefinition] => entry[1] !== undefined)
      : Object.entries(BUILTIN_TOOLS)

  for (const [name, toolDef] of toolEntries) {
    registerBuiltinTool(server, name, toolDef, context)
  }

  return server
}

function registerBuiltinTool(
  server: McpServer,
  name: string,
  toolDef: ToolDefinition,
  context: ToolContext
): void {
  // MCP SDK's registerTool accepts ZodRawShapeCompat for inputSchema,
  // which is the inner shape of a z.object() — a Record<string, ZodSchema>.
  const shape = extractZodShape(toolDef.parameters)

  const handler = async (args: Record<string, unknown>) => {
    try {
      const result = await toolDef.execute(args, context)
      return {
        content: [
          {
            type: "text" as const,
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Tool execution error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      }
    }
  }

  if (shape) {
    server.registerTool(
      name,
      { description: toolDef.description, inputSchema: shape },
      handler
    )
  } else {
    server.registerTool(name, { description: toolDef.description }, handler)
  }
}

/**
 * Extract the raw shape from a Zod object schema.
 * ToolDefinition.parameters is always z.object({...}), so we extract
 * the shape property which is what MCP SDK's registerTool expects.
 */
function extractZodShape(
  schema: z.ZodSchema
): Record<string, z.ZodSchema> | null {
  if ("_def" in schema) {
    const def = (schema as Record<string, unknown>)._def as Record<
      string,
      unknown
    >
    if (
      def.typeName === "ZodObject" &&
      typeof def.shape === "function"
    ) {
      return (def.shape as () => Record<string, z.ZodSchema>)()
    }
  }
  return null
}
