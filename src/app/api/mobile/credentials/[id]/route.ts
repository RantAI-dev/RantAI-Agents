import { NextResponse } from "next/server"

import { UpdateCredentialSchema } from "@/features/credentials/schema"
import {
  deleteDashboardCredentialRecord,
  updateDashboardCredentialRecord,
} from "@/features/credentials/service"
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
 * PUT /api/mobile/credentials/[id] — update a credential. Omit `data` to keep
 * the existing secret. Body: { name?, type?, data? }.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const parsed = UpdateCredentialSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await updateDashboardCredentialRecord({
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      id,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Credentials API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 })
  }
}

/**
 * DELETE /api/mobile/credentials/[id] — delete a credential.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const result = await deleteDashboardCredentialRecord({
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      id,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Mobile Credentials API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 })
  }
}
