import { NextResponse } from "next/server"

import { CreateAgentApiKeySchema } from "@/features/agent-api-keys/schema"
import {
  createAgentApiKey,
  listAgentApiKeys,
} from "@/features/agent-api-keys/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/agent-api-keys — list the org's agent API keys (owner/admin).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const result = await listAgentApiKeys({
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Agent API Keys] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/agent-api-keys — create a key for an assistant (owner/admin).
 * The full key is returned once. Body: { name, assistantId, scopes?,
 * ipWhitelist?, expiresAt? }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const parsed = CreateAgentApiKeySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const result = await createAgentApiKey({
      context: {
        organizationId: ctx.organizationId,
        role: ctx.role,
        userId: ctx.userId,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Agent API Keys] POST error:", error)
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 })
  }
}
