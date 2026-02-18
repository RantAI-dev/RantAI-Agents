import { z } from "zod"
import type { CoreTool } from "ai"

export interface ToolDefinition {
  name: string
  displayName: string
  description: string
  category: "builtin" | "custom" | "mcp"
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
}

export interface ResolvedTools {
  tools: Record<string, CoreTool>
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
