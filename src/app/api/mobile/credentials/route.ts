import { NextResponse } from "next/server"

import { CreateCredentialSchema } from "@/features/credentials/schema"
import {
  createDashboardCredential,
  listDashboardCredentials,
} from "@/features/credentials/service"
import { getMobileContext } from "@/lib/mobile-org"

function isServiceError(
  value: unknown
): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

/**
 * GET /api/mobile/credentials — list the org's credentials (masked; no secret
 * data is ever returned).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const credentials = await listDashboardCredentials({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    })
    return NextResponse.json(credentials)
  } catch (error) {
    console.error("[Mobile Credentials API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch credentials" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/mobile/credentials — create a credential. `data` is sent as
 * plaintext and encrypted (AES-256-GCM) server-side.
 * Body: { name, type, data }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = CreateCredentialSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardCredential({
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Mobile Credentials API] POST error:", error)
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 })
  }
}
