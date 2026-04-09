import { z } from "zod"
import type { ToolSet } from "ai"

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  category: "builtin" | "custom" | "openapi" | "mcp" | "community"
  parameters: z.ZodSchema
  execute: (
    params: Record<string, unknown>,
    context: ToolContext
  ) => Promise<unknown>
}

export interface ToolContext {
  organizationId?: string
  userId?: string
  sessionId?: string
  assistantId?: string
  /**
   * Active canvas mode (artifact tools only):
   *   - undefined / null / false  → no canvas constraint
   *   - "auto"                    → LLM picks the type
   *   - "<artifact-mime-type>"    → LLM MUST use that exact type
   *
   * When set to a specific MIME type, `create_artifact` will reject calls
   * whose `type` parameter doesn't match — the mismatch is surfaced as a
   * validation error so the LLM retries with the correct type.
   */
  canvasMode?: string | false | null
}

export interface ResolvedTools {
  tools: ToolSet
  toolNames: string[]
}

export interface ExecutionConfig {
  url: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  authType?: "none" | "api_key" | "bearer"
  authHeaderName?: string
  authValue?: string
  timeoutMs?: number
}
