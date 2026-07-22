import { NextResponse } from "next/server"

import { KnowledgeGroupCreateSchema } from "@/features/knowledge/groups/schema"
import {
  createKnowledgeGroupForDashboard,
  listKnowledgeGroupsForDashboard,
} from "@/features/knowledge/groups/service"
import { countKnowledgeDocumentsForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

/** GET /api/mobile/knowledge/groups — knowledge bases with total doc count. */
export async function GET(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const [groups, totalDocumentCount] = await Promise.all([
      listKnowledgeGroupsForDashboard(ctx.organizationId),
      countKnowledgeDocumentsForDashboard(ctx.organizationId),
    ])
    return NextResponse.json({ groups, totalDocumentCount })
  } catch (error) {
    console.error("[Mobile Knowledge] list groups error:", error)
    return NextResponse.json({ error: "Failed to list groups" }, { status: 500 })
  }
}

/** POST /api/mobile/knowledge/groups — create a knowledge base. */
export async function POST(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeGroupCreateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const group = await createKnowledgeGroupForDashboard({
      organizationId: ctx.organizationId,
      role: ctx.role,
      userId: ctx.userId,
      input: parsed.data,
    })
    if (isHttpServiceError(group)) {
      return NextResponse.json({ error: group.error }, { status: group.status })
    }
    return NextResponse.json(group)
  } catch (error) {
    console.error("[Mobile Knowledge] create group error:", error)
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
