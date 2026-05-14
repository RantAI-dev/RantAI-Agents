import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  KnowledgeCategoryCreateSchema,
} from "@/features/knowledge/categories/schema"
import {
  createKnowledgeCategoryForDashboard,
  listKnowledgeCategoriesForDashboard,
} from "@/features/knowledge/categories/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET - List categories visible to the caller's org (own + global)
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
    const categories = await listKnowledgeCategoriesForDashboard(orgContext?.organizationId ?? null)
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Failed to list categories:", error)
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 })
  }
}

// POST - Create a category scoped to the caller's org
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedBody = KnowledgeCategoryCreateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
    const category = await createKnowledgeCategoryForDashboard({
      input: parsedBody.data,
      organizationId: orgContext?.organizationId ?? null,
      userId: session.user.id,
    })

    if (isHttpServiceError(category)) {
      return NextResponse.json({ error: category.error }, { status: category.status })
    }

    return NextResponse.json(category)
  } catch (error) {
    console.error("Failed to create category:", error)
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}
