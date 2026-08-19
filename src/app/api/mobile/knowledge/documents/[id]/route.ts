import { NextResponse } from "next/server"

import {
  KnowledgeDocumentIdParamsSchema,
  KnowledgeDocumentUpdateSchema,
} from "@/features/knowledge/documents/schema"
import {
  deleteKnowledgeDocumentForDashboard,
  getKnowledgeDocumentForDashboard,
  updateKnowledgeDocumentForDashboard,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mobile/knowledge/documents/[id] — detail with extracted content + chunks
export async function GET(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeDocumentIdParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid document id" }, { status: 400 })

  try {
    const result = await getKnowledgeDocumentForDashboard({
      documentId: parsed.data.id,
      organizationId: ctx.organizationId,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Knowledge] get document error:", error)
    return NextResponse.json({ error: "Failed to get document" }, { status: 500 })
  }
}

// PUT /api/mobile/knowledge/documents/[id] — update metadata (title/categories/groups)
export async function PUT(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsedParams = KnowledgeDocumentIdParamsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid document id" }, { status: 400 })

  const parsedBody = KnowledgeDocumentUpdateSchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsedBody.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const result = await updateKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
      input: parsedBody.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Knowledge] update document error:", error)
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 })
  }
}

// DELETE /api/mobile/knowledge/documents/[id] — soft delete (?hard=true to purge)
export async function DELETE(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeDocumentIdParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid document id" }, { status: 400 })

  const hard = new URL(request.url).searchParams.get("hard") === "true"

  try {
    const result = await deleteKnowledgeDocumentForDashboard({
      documentId: parsed.data.id,
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
      hard,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Knowledge] delete document error:", error)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
