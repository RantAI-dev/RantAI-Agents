import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  KnowledgeCategoryCreateSchema,
} from "@/features/knowledge/categories/schema"
import {
  createKnowledgeCategoryForDashboard,
  listKnowledgeCategoriesForDashboard,
} from "@/features/knowledge/categories/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

// GET - List all categories (seeds defaults if empty)
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const categories = await listKnowledgeCategoriesForDashboard()
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Failed to list categories:", error)
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 })
  }
}

// POST - Create a new category
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

    const category = await createKnowledgeCategoryForDashboard({
      input: parsedBody.data,
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
