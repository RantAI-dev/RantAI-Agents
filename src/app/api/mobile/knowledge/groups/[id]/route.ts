import { NextResponse } from "next/server"

import {
  KnowledgeGroupIdParamsSchema,
  KnowledgeGroupUpdateSchema,
} from "@/features/knowledge/groups/schema"
import {
  deleteKnowledgeGroupForDashboard,
  getKnowledgeGroupForDashboard,
  updateKnowledgeGroupForDashboard,
} from "@/features/knowledge/groups/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mobile/knowledge/groups/[id] — a knowledge base with its documents
export async function GET(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeGroupIdParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid group id" }, { status: 400 })

  try {
    const group = await getKnowledgeGroupForDashboard({
      groupId: parsed.data.id,
      organizationId: ctx.organizationId,
    })
    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }
    return NextResponse.json(group)
  } catch (error) {
    console.error("[Mobile Knowledge] get group error:", error)
    return NextResponse.json({ error: "Failed to get group" }, { status: 500 })
  }
}

// PUT /api/mobile/knowledge/groups/[id]
export async function PUT(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsedParams = KnowledgeGroupIdParamsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid group id" }, { status: 400 })

  const parsedBody = KnowledgeGroupUpdateSchema.safeParse(await request.json())
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsedBody.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const group = await updateKnowledgeGroupForDashboard({
      groupId: parsedParams.data.id,
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
      input: parsedBody.data,
    })
    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }
    return NextResponse.json(group)
  } catch (error) {
    console.error("[Mobile Knowledge] update group error:", error)
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 })
  }
}

// DELETE /api/mobile/knowledge/groups/[id] — unassigns documents (keeps them)
export async function DELETE(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeGroupIdParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid group id" }, { status: 400 })

  try {
    const group = await deleteKnowledgeGroupForDashboard({
      groupId: parsed.data.id,
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
    })
    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }
    return NextResponse.json(group)
  } catch (error) {
    console.error("[Mobile Knowledge] delete group error:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
