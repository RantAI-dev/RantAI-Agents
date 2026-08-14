import { NextResponse } from "next/server"

import { UpdateAgentApiKeySchema } from "@/features/agent-api-keys/schema"
import {
  deleteAgentApiKey,
  updateAgentApiKey,
} from "@/features/agent-api-keys/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * PUT /api/mobile/agent-api-keys/[id] — update a key (e.g. enable/disable,
 * rename). Body: { name?, scopes?, ipWhitelist?, enabled?, expiresAt? }.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const parsed = UpdateAgentApiKeySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }
    const result = await updateAgentApiKey({
      context: {
        organizationId: ctx.organizationId,
        role: ctx.role,
        userId: ctx.userId,
      },
      id,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Agent API Keys] PUT error:", error)
    return NextResponse.json({ error: "Failed to update API key" }, { status: 500 })
  }
}

/**
 * DELETE /api/mobile/agent-api-keys/[id] — revoke a key.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = await params
    const result = await deleteAgentApiKey(
      { organizationId: ctx.organizationId, role: ctx.role, userId: ctx.userId },
      id
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Agent API Keys] DELETE error:", error)
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 })
  }
}
