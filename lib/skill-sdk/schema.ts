import type { z } from "zod"
import { zodToJsonSchema } from "@/lib/tools/utils"
import type { CommunityToolDefinition } from "./types"

/**
 * Convert a community tool's Zod parameters to JSON Schema
 * for DB storage (same format as existing Tool.parameters).
 */
export function communityToolToJsonSchema(
  tool: CommunityToolDefinition
): object {
  return zodToJsonSchema(tool.parameters)
}

/**
 * Convert a skill's configSchema to a JSON Schema object
 * for rendering config forms in the UI.
 */
export function configSchemaToJsonSchema(
  schema: z.ZodSchema
): object {
  return zodToJsonSchema(schema)
}
