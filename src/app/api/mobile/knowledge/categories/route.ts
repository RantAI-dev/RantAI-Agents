import { NextResponse } from "next/server"

import { KnowledgeCategoryCreateSchema } from "@/features/knowledge/categories/schema"
import {
  createKnowledgeCategoryForDashboard,
  listKnowledgeCategoriesForDashboard,
} from "@/features/knowledge/categories/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

/** GET /api/mobile/knowledge/categories — org + global category tags. */
export async function GET(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const categories = await listKnowledgeCategoriesForDashboard(ctx.organizationId)
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("[Mobile Knowledge] list categories error:", error)
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 })
  }
}

/** POST /api/mobile/knowledge/categories — create a category tag. */
export async function POST(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeCategoryCreateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const category = await createKnowledgeCategoryForDashboard({
      input: parsed.data,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    })
    if (isHttpServiceError(category)) {
      return NextResponse.json({ error: category.error }, { status: category.status })
    }
    return NextResponse.json(category)
  } catch (error) {
    console.error("[Mobile Knowledge] create category error:", error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}
